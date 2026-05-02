import { EmailMessage } from "cloudflare:email";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/sign") {
      return handleSign(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleSign(request, env) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "json required" }, { status: 400 });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const errors = validate(data);
  if (errors) return Response.json({ errors }, { status: 400 });

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ua = request.headers.get("User-Agent") || "unknown";

  const verified = await verifyTurnstile(
    data.turnstileToken,
    env.TURNSTILE_SECRET,
    ip,
  );
  if (!verified) {
    return Response.json({ error: "verification failed" }, { status: 400 });
  }

  const moderators = env.MODERATORS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (moderators.length === 0) {
    console.error("no moderators configured");
    return Response.json({ error: "send failed" }, { status: 500 });
  }

  try {
    await Promise.all(
      moderators.map((to) => {
        const mime = buildMime({ data, from: env.FROM_ADDRESS, to, ip, ua });
        return env.EMAIL.send(
          new EmailMessage(env.FROM_ADDRESS, to, mime),
        );
      }),
    );
  } catch (err) {
    console.error("send_email failed", err);
    return Response.json({ error: "send failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
}

function validate(data) {
  const errors = {};
  const name = trimHeader(data.name);
  const email = trimHeader(data.email);
  const role = trimHeader(data.role);
  const org = trimHeader(data.org);
  const details = trimBody(data.details);

  if (!name.length) errors.name = "Enter your full name";
  else if (name.length > 80)
    errors.name = "Name must be 80 characters or fewer";

  if (!email.length) errors.email = "Enter your email address";
  else if (email.length > 200)
    errors.email = "Email address must be 200 characters or fewer";
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    errors.email =
      "Enter an email address in the correct format, like name@example.com";

  if (data.contributed !== "yes" && data.contributed !== "no")
    errors.contributed =
      "Choose whether you have contributed to UK public-sector software";

  if (data.contributed === "yes") {
    if (!details.length)
      errors.details = "Enter details of your contribution";
    else if (details.length > 2000)
      errors.details = "Details must be 2,000 characters or fewer";
  }

  if (role.length > 80) errors.role = "Role must be 80 characters or fewer";
  if (org.length > 80)
    errors.org = "Organisation must be 80 characters or fewer";

  if (typeof data.turnstileToken !== "string" || !data.turnstileToken)
    errors.turnstileToken = "Complete the verification challenge";

  return Object.keys(errors).length ? errors : null;
}

function trimHeader(s) {
  return typeof s === "string" ? s.replace(/[\r\n]+/g, " ").trim() : "";
}

function trimBody(s) {
  return typeof s === "string" ? s.trim() : "";
}

async function verifyTurnstile(token, secret, ip) {
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const json = await res.json();
    return json.success === true;
  } catch (err) {
    console.error("turnstile verify failed", err);
    return false;
  }
}

function buildMime({ data, from, to, ip, ua }) {
  const name = trimHeader(data.name);
  const role = trimHeader(data.role);
  const org = trimHeader(data.org);
  const email = trimHeader(data.email);
  const contributed = data.contributed === "yes" ? "yes" : "no";
  const details = trimBody(data.details);
  const anonymous = data.anonymous === true;

  const subject = `[signatures] ${anonymous ? "(anonymous) " : ""}${name}`;
  const cardLine = buildCardLine({
    name: anonymous ? "Anonymous" : name,
    role,
    org,
    contributor: contributed === "yes",
  });

  const detailsBlock =
    contributed === "yes"
      ? ["", "--- Contribution details ---", details, "--- end ---"]
      : [];

  const body = [
    "New signature submission.",
    "",
    `Anonymous:   ${anonymous ? "yes — delete this email within 24 hours of verification" : "no"}`,
    `Contributed: ${contributed}`,
    `Name:        ${name}`,
    `Role:        ${role || "(none)"}`,
    `Org:         ${org || "(none)"}`,
    `Email:       ${email}`,
    "",
    'Suggested line:',
    cardLine,
    ...detailsBlock,
    "",
    `Submitted from: ${ip}`,
    `User-Agent:     ${ua}`,
  ].join("\r\n");

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Reply-To: ${email}`,
    `Subject: ${subject}`,
    `Message-ID: <${crypto.randomUUID()}@keepthingsopen.com>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
  ];

  return headers.join("\r\n") + "\r\n\r\n" + body;
}

function buildCardLine({ name, role, org, contributor }) {
  const parts = [];
  if (role && org) parts.push(`${role} (${org})`);
  else if (role) parts.push(role);
  else if (org) parts.push(`(${org})`);
  if (contributor) parts.push("Contributor");
  const tail = parts.length ? `, ${parts.join(", ")}` : "";
  return `- **${name}**${tail}`;
}
