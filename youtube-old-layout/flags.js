// Runs in the page's own JavaScript world before any YouTube script.
//
// YouTube decides between the old and new watch-page layouts by reading
// experiment flags from yt.config_.EXPERIMENT_FLAGS (also reachable through
// ytcfg). YouTube's inline scripts assign that object a moment after this file
// runs, so we can't just overwrite it now. Instead we install property traps
// along the chain window.yt -> config_ -> EXPERIMENT_FLAGS. Whenever YouTube
// assigns a link in the chain, the trap re-arms on the new object, and when the
// flags object finally arrives we pin each layout flag to false.
//
// This is the same trick as uBlock Origin's +js(set, ...) scriptlet, which is
// where this flag list comes from (October 2026 reports).

(() => {
  'use strict';

  const FLAGS = {
    web_watch_eligible_to_switch_to_grid: false,
    web_watch_enable_single_column_grid_view: false,
    web_fixed_panel_watch_next_grid_swap: false,
    web_watch_fixed_default_panels: false,
    web_engagement_panel_show_description: false,
    web_watch_move_summary_to_sd: false,
    web_watch_hero_list: false,
    web_watch_split_scroll: false,
    web_side_rail_dismissible_panels: false,
    kevlar_watch_hide_comments_while_panel_open: false,
    disable_theater_mode: false,
  };

  // Force each flag to its value and keep it there even if YouTube writes to it
  // again later (ytcfg.set merges into the same object).
  function pin(flags) {
    for (const name of Object.keys(FLAGS)) {
      const value = FLAGS[name];
      try {
        Object.defineProperty(flags, name, {
          get: () => value,
          set: () => {},
          configurable: true,
          enumerable: true,
        });
      } catch (e) {
        flags[name] = value;
      }
    }
  }

  // Watch owner[prop]. If it already holds an object, hand it to onObject now.
  // From then on, every assignment to owner[prop] also calls onObject.
  function trap(owner, prop, onObject) {
    let current = owner[prop];
    if (current && typeof current === 'object') onObject(current);
    try {
      Object.defineProperty(owner, prop, {
        get: () => current,
        set: (v) => {
          current = v;
          if (v && typeof v === 'object') onObject(v);
        },
        configurable: true,
        enumerable: true,
      });
    } catch (e) {
      // Property not configurable; nothing more we can do here.
    }
  }

  trap(window, 'yt', (yt) =>
    trap(yt, 'config_', (cfg) => trap(cfg, 'EXPERIMENT_FLAGS', pin)));

  // ytcfg keeps its own store until window.yt exists; cover that path too.
  trap(window, 'ytcfg', (ytcfg) =>
    trap(ytcfg, 'data_', (data) => trap(data, 'EXPERIMENT_FLAGS', pin)));
})();
