import api from "./api";

const getSearchResults = (query, signal) => (
  api.get(`/search?q=${encodeURIComponent(query)}`, { signal })
);

export { getSearchResults };
