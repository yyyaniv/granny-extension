// All YouTube DOM selectors live here (YouTube changes its markup often).
window.GrannySelectors = {
  // Containers that represent one video card in feeds / search results.
  cardSelectors: [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-compact-video-renderer',
    'yt-lockup-view-model',
  ],
  // Link inside a card that opens the video.
  cardLink: 'a[href*="/watch?v="], a[href^="/watch?"]',
  // Related videos on the watch page (for the "what next" overlay).
  relatedSelectors: [
    'ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer',
    'ytd-watch-next-secondary-results-renderer yt-lockup-view-model',
    '#related ytd-compact-video-renderer',
    '#related yt-lockup-view-model',
  ],
  // YouTube's own end screen tiles (fallback for related list).
  endscreenTiles: 'a.ytp-videowall-still',
  endscreenTitle: '.ytp-videowall-still-info-title',
  titleSelectors: ['#video-title', 'h3', '.yt-lockup-metadata-view-model-wiz__title', 'a[title]'],
  // Enter keeps its native meaning when focus is inside these (menus, dialogs).
  nativeEnterZones: 'ytd-popup-container, tp-yt-paper-dialog, ytd-guide-renderer, tp-yt-iron-dropdown',
  // Player settings popup: arrows/Enter keep their native meaning inside it.
  playerMenus: '.ytp-popup, .ytp-panel',
  liveBadge: '.ytp-live-badge',
  watchTitle: 'h1.ytd-watch-metadata, ytd-watch-metadata h1, #title h1',
  watchChannel: 'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a',
  // Where the inline "save" button is inserted (first match wins): right under the player, above the title.
  saveAnchors: ['ytd-watch-metadata', '#above-the-fold'],
  mainVideo: 'video.html5-main-video, #movie_player video',
  player: '#movie_player',
  adShowing: '.ad-showing',
  // Elements hidden when "hide Shorts and comments" is on.
  hide: [
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
    'ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)',
    'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
    'ytd-video-renderer:has(a[href^="/shorts/"])',
    'yt-lockup-view-model:has(a[href^="/shorts/"])',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    'grid-shelf-view-model:has(a[href^="/shorts/"])',
    'ytd-guide-entry-renderer:has(a[title="Shorts"])',
    'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
    'ytd-comments#comments',
    '#comments',
  ],
};
