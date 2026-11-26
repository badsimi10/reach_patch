
const express = require("express");
const { execFile } = require("child_process");
const net = require("net");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(express.urlencoded({ extended: false, limit: "2kb" }));
app.use(express.static(path.join(__dirname, "public")));

const recent = [
  {
    host: "shop-printer.club",
    status: "up",
    detail: "1 packet, 12 ms"
  },
  {
    host: "booth-cam.club",
    status: "down",
    detail: "no reply"
  }
];

// Diagnostic information for Render logs.
console.log("Reach startup diagnostics:", {
  nodeVersion: process.version,
  platform: process.platform,
  pingExists: fs.existsSync("/usr/bin/ping"),
  uid: process.getuid?.(),
  gid: process.getgid?.()
});

// Escape user-controlled text before displaying HTML.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Render the original Reach interface.
function page(error, result) {
  const rows = recent
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.host)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(row.detail)}</td>
        </tr>`
    )
    .join("");

  const card = result
    ? `
      <article class="card">
        <p class="status">${escapeHtml(result.status)}</p>
        <h2>${escapeHtml(result.host)}</h2>
        <pre>${escapeHtml(result.detail)}</pre>
      </article>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reach</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="shell">
    <header class="top">
      <a class="brand" href="/">
        <span class="mark">Rh</span>
        <span>
          <strong>Reach</strong>
          <em>Is the host up?</em>
        </span>
      </a>
    </header>

    <main>
      <section class="hero">
        <h1>One host. One reply.</h1>
        <p class="lede">
          Reach pings a club host and keeps the reply. No account.
        </p>
      </section>

      <form method="post" action="/" class="stack">
        <label>
          <span>Host</span>
          <input
            name="host"
            placeholder="shop-printer.club"
            required
          >
        </label>
        <button type="submit">Check</button>
      </form>

      ${error
        ? `<p class="flash">${escapeHtml(error)}</p>`
        : ""}

      ${card}

      <h2 class="section">Recent checks</h2>
      <table>
        <thead>
          <tr>
            <th>Host</th>
            <th>Status</th>
            <th>Reply</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </main>

    <footer>
      Reach is unofficial. It only pings what you type.
    </footer>
  </div>
</body>
</html>`;
}

// Health check.
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Homepage.
app.get("/", (_req, res) => {
  res.type("html").send(page(null, null));
});

// Validate DNS hostnames and IP addresses.
function validHost(host) {
  if (!host || host.length > 253) {
    return false;
  }

  // Accept IPv4 and IPv6 addresses.
  if (net.isIP(host)) {
    return true;
  }

  // Reject command syntax and invalid DNS labels.
  return host.split(".").every((label) => {
    return (
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)
    );
  });
}

// Host checking endpoint.
app.post("/", (req, res) => {
  if (
    !req.body ||
    typeof req.body.host !== "string"
  ) {
    return res.status(400).type("html").send(
      page("Enter a valid hostname or IP address.", null)
    );
  }

  const host = req.body.host.trim();

  if (!validHost(host)) {
    return res.status(400).type("html").send(
      page("Enter a valid hostname or IP address.", null)
    );
  }

  console.log("Reach checking host:", host);

  // Use execFile instead of exec to avoid shell injection.
  // The "--" prevents host input being treated as options.
  execFile(
    "/usr/bin/ping",
    ["-c", "1", "-W", "2", "--", host],
    {
      timeout: 4000,
      maxBuffer: 64 * 1024,
      shell: false
    },
    (err, stdout, stderr) => {
      if (err) {
        console.error("Ping diagnostic:", {
          code: err.code,
          message: err.message,
          stderr: stderr
        });

        // Process execution or permission failure.
        if (
          err.code === "EPERM" ||
          err.code === "EACCES" ||
          err.code === "ENOENT"
        ) {
          return res.status(503).type("html").send(
            page(
              "Ping is unavailable due to server configuration or permissions.",
              null
            )
          );
        }

        // Execution timeout.
        if (err.killed) {
          return res.status(504).type("html").send(
            page("The host check timed out.", null)
          );
        }
      }

      const detail = (
        stdout ||
        stderr ||
        (err ? "Host did not respond." : "No reply.")
      ).slice(0, 800);

      const status = err ? "down" : "up";

      // Add the completed check to recent results.
      recent.unshift({
        host,
        status,
        detail
      });

      // Keep only the five most recent checks.
      if (recent.length > 5) {
        recent.length = 5;
      }

      return res.type("html").send(
        page(null, {
          host,
          status,
          detail
        })
      );
    }
  );
});

// Start Express server.
const port = Number(process.env.PORT || 3000);

app.listen(port, "0.0.0.0", () => {
  console.log(`Reach listening on ${port}`);
});

