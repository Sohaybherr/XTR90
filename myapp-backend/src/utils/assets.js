function toAssetPath(path) {
  if (!path) return path;
  if (path.startsWith("/uploads/")) {
    return path.replace("/uploads/", "/assets/");
  }
  return path;
}

module.exports = {
  toAssetPath,
};
