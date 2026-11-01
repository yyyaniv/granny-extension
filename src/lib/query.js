export function buildTopicQuery(prefix, phrase) {
  return `${prefix || ''} ${phrase || ''}`.replace(/\s+/g, ' ').trim();
}

export function buildYoutubeSearchUrl(query) {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
}
