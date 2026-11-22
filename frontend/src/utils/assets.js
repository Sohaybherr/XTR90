const apiBaseUrl = import.meta.env.VITE_API_URL || "/api/v1";
const assetBaseUrl = import.meta.env.VITE_ASSET_URL || "";

function getAssetOrigin() {
  if (assetBaseUrl) {
    return assetBaseUrl.replace(/\/$/, "");
  }

  if (!apiBaseUrl.startsWith("http")) {
    return "";
  }

  return new URL(apiBaseUrl).origin;
}

export function resolveAssetUrl(src) {
  if (!src) {
    return "";
  }

  if (/^(https?:)?\/\//.test(src) || src.startsWith("data:")) {
    return src;
  }

  const normalizedSrc = src.startsWith("/uploads/")
    ? src.replace("/uploads/", "/assets/")
    : src;

  if (normalizedSrc.startsWith("/")) {
    return `${getAssetOrigin()}${normalizedSrc}`;
  }

  return normalizedSrc;
}
