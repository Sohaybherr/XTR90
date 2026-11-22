const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const USERS_ASSET_DIR = path.join(__dirname, "../../public/assets/users");
const PUBLIC_USERS_PATH = "/assets/users";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function extensionFromContentType(contentType) {
  if (!contentType) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  return ".jpg";
}

async function downloadUserAvatar(avatarUrl, provider, providerUserId) {
  if (!avatarUrl || typeof fetch !== "function") {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;

    try {
      response = await fetch(avatarUrl, {
        redirect: "follow",
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.startsWith("image/")) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (!buffer.length || buffer.length > MAX_AVATAR_BYTES) {
      return null;
    }

    await fs.mkdir(USERS_ASSET_DIR, { recursive: true });

    const fingerprint = crypto
      .createHash("sha256")
      .update(`${provider}:${providerUserId}`)
      .digest("hex")
      .slice(0, 24);
    const extension = extensionFromContentType(contentType);
    const filename = `${provider}_${fingerprint}${extension}`;
    const filePath = path.join(USERS_ASSET_DIR, filename);

    await fs.writeFile(filePath, buffer);
    return `${PUBLIC_USERS_PATH}/${filename}`;
  } catch (error) {
    console.warn("Avatar download failed:", error.message);
    return null;
  }
}

module.exports = {
  downloadUserAvatar
};
