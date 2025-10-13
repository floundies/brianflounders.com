(function () {
  try {
    var loc  = window.location;
    var path = loc.pathname || "/";
    var hash = loc.hash || "";
    // Already hash route → do nothing
    if (hash.startsWith("#/")) return;

    // If user opened /post/... or /tag/... → rewrite to hash so SPA router loads correct view
    if (path.startsWith("/post/")) {
      loc.replace("/#"+path);
      return;
    }
    if (path.startsWith("/tag/")) {
      loc.replace("/#"+path);
      return;
    }
  } catch (e) {
    console.error("bridge error", e);
  }
})();