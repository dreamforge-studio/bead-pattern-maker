/*
 * Bead Pattern Maker — fuse bead palette (Perler / Hama compatible colors).
 * 64 colors with brand-style codes and English names.
 * Hex values are the commonly published chart approximations used by
 * community bead tools; close enough for hobby pattern making.
 * Works in the browser (window.BEAD_PALETTE) and in Node (module.exports).
 */
(function (global) {
  'use strict';

  var PALETTE = [
    // ---- Hama-style core colors ----
    { code: 'H01', name: 'White',           hex: '#F6F6F6' },
    { code: 'H02', name: 'Cream',           hex: '#F1E4C3' },
    { code: 'H03', name: 'Yellow',          hex: '#F6C90E' },
    { code: 'H04', name: 'Orange',          hex: '#EE6A24' },
    { code: 'H05', name: 'Red',             hex: '#BE1E2D' },
    { code: 'H06', name: 'Pink',            hex: '#E38CA6' },
    { code: 'H07', name: 'Purple',          hex: '#6E4B9E' },
    { code: 'H08', name: 'Blue',            hex: '#2456A6' },
    { code: 'H09', name: 'Light Blue',      hex: '#7BA7D9' },
    { code: 'H10', name: 'Green',           hex: '#1E9E4A' },
    { code: 'H11', name: 'Light Green',     hex: '#8CC63E' },
    { code: 'H12', name: 'Brown',           hex: '#6E3B26' },
    { code: 'H17', name: 'Grey',            hex: '#939598' },
    { code: 'H18', name: 'Black',           hex: '#17181A' },
    { code: 'H20', name: 'Reddish Brown',   hex: '#9A4A21' },
    { code: 'H21', name: 'Light Brown',     hex: '#B07B4F' },
    { code: 'H22', name: 'Dark Red',        hex: '#7E1F24' },
    { code: 'H26', name: 'Flesh',           hex: '#F3C29B' },
    { code: 'H27', name: 'Beige',           hex: '#D8B98F' },
    { code: 'H28', name: 'Dark Green',      hex: '#14663C' },
    { code: 'H29', name: 'Burgundy',        hex: '#77202F' },
    { code: 'H30', name: 'Dark Brown',      hex: '#4E2C17' },
    { code: 'H31', name: 'Turquoise',       hex: '#28A6A0' },
    { code: 'H38', name: 'Tan',             hex: '#C9A876' },
    // ---- Extended Perler-style colors ----
    { code: 'P01', name: 'Cheddar',         hex: '#F2A03D' },
    { code: 'P02', name: 'Butterscotch',    hex: '#D98E4A' },
    { code: 'P03', name: 'Rust',            hex: '#B3502E' },
    { code: 'P04', name: 'Cranapple',       hex: '#A11F37' },
    { code: 'P05', name: 'Plum',            hex: '#7E4A7F' },
    { code: 'P06', name: 'Lavender',        hex: '#B08FC9' },
    { code: 'P07', name: 'Periwinkle Blue', hex: '#7C8FC7' },
    { code: 'P08', name: 'Midnight Blue',   hex: '#2E3A67' },
    { code: 'P09', name: 'Dark Blue',       hex: '#20398C' },
    { code: 'P10', name: 'Sky Blue',        hex: '#8EC9E8' },
    { code: 'P11', name: 'Pastel Blue',     hex: '#A9CCE8' },
    { code: 'P12', name: 'Pastel Green',    hex: '#A8D5A2' },
    { code: 'P13', name: 'Evergreen',       hex: '#1E5B3E' },
    { code: 'P14', name: 'Shamrock',        hex: '#3FA34D' },
    { code: 'P15', name: 'Kiwi Lime',       hex: '#A9BE5A' },
    { code: 'P16', name: 'Sand',            hex: '#E3CFA3' },
    { code: 'P17', name: 'Fawn',            hex: '#B98A5E' },
    { code: 'P18', name: 'Peach',           hex: '#F6C39A' },
    { code: 'P19', name: 'Apricot',         hex: '#F2B183' },
    { code: 'P20', name: 'Blush Pink',      hex: '#E89B9B' },
    { code: 'P21', name: 'Hot Coral',       hex: '#E4572E' },
    { code: 'P22', name: 'Magenta',         hex: '#C13B8A' },
    { code: 'P23', name: 'Orchid',          hex: '#A86BA8' },
    { code: 'P24', name: 'Bubblegum',       hex: '#E87EA1' },
    { code: 'P25', name: 'Light Pink',      hex: '#F4C6D8' },
    { code: 'P26', name: 'Lilac',           hex: '#C5A3D9' },
    { code: 'P27', name: 'Slate Blue',      hex: '#5B7290' },
    { code: 'P28', name: 'Denim',           hex: '#3E5C82' },
    { code: 'P29', name: 'Charcoal',        hex: '#45454B' },
    { code: 'P30', name: 'Light Grey',      hex: '#C9CCCE' },
    { code: 'P31', name: 'Dark Grey',       hex: '#5E6165' },
    { code: 'P32', name: 'Gold',            hex: '#C9A227' },
    { code: 'P33', name: 'Silver',          hex: '#BFC3C9' },
    { code: 'P34', name: 'Bronze',          hex: '#A97142' },
    { code: 'P35', name: 'Fluorescent Yellow', hex: '#DCE93B' },
    { code: 'P36', name: 'Fluorescent Pink',   hex: '#F0569B' },
    { code: 'P37', name: 'Mint',            hex: '#9FD8C9' },
    { code: 'P38', name: 'Teal',            hex: '#1F7A72' },
    { code: 'P39', name: 'Olive',           hex: '#7A7A3A' },
    { code: 'P40', name: 'Cocoa',           hex: '#8A5A33' }
  ];

  /*
   * FULL palette extension — unlocked by the Pro / Studio plans.
   * Extra Hama + Perler shades plus an Artkal-style range, so paid plans
   * match against 100 colors instead of the 64-color basic palette.
   */
  var FULL_EXTRA = [
    // ---- more Hama shades ----
    { code: 'H13', name: 'Cerise',          hex: '#D6336C' },
    { code: 'H14', name: 'Orange Red',      hex: '#E4572E' },
    { code: 'H15', name: 'Pastel Yellow',   hex: '#F7E38B' },
    { code: 'H16', name: 'Pastel Green',    hex: '#B5D99C' },
    { code: 'H19', name: 'Dark Grey',       hex: '#6B6F72' },
    { code: 'H23', name: 'Wine Red',        hex: '#8E2434' },
    { code: 'H24', name: 'Violet',          hex: '#8B6BAE' },
    { code: 'H25', name: 'Azure',           hex: '#2E7FC2' },
    { code: 'H32', name: 'Mint Green',      hex: '#7FC8A9' },
    { code: 'H33', name: 'Moss Green',      hex: '#5B7553' },
    { code: 'H34', name: 'Caramel',         hex: '#C68B4E' },
    { code: 'H35', name: 'Ivory',           hex: '#F7F1DE' },
    // ---- more Perler shades ----
    { code: 'P41', name: 'Tangerine',       hex: '#F2853F' },
    { code: 'P42', name: 'Salmon',          hex: '#F1948A' },
    { code: 'P43', name: 'Fuchsia',         hex: '#C2187A' },
    { code: 'P44', name: 'Grape',           hex: '#5E3A8C' },
    { code: 'P45', name: 'Cobalt Blue',     hex: '#27408B' },
    { code: 'P46', name: 'Aqua',            hex: '#57B8C4' },
    { code: 'P47', name: 'Forest Green',    hex: '#14532D' },
    { code: 'P48', name: 'Sage',            hex: '#A3B18A' },
    { code: 'P49', name: 'Mahogany',        hex: '#6E2B20' },
    { code: 'P50', name: 'Almond',          hex: '#D9B48F' },
    { code: 'P51', name: 'Rose',            hex: '#D96C85' },
    { code: 'P52', name: 'Steel Blue',      hex: '#4682B4' },
    // ---- Artkal-style range ----
    { code: 'A01', name: 'Artkal Snow',     hex: '#FAFAF7' },
    { code: 'A02', name: 'Artkal Lemon',    hex: '#F5D90A' },
    { code: 'A03', name: 'Artkal Scarlet',  hex: '#D7263D' },
    { code: 'A04', name: 'Artkal Rosewood', hex: '#9B4444' },
    { code: 'A05', name: 'Artkal Iris',     hex: '#7D5BA6' },
    { code: 'A06', name: 'Artkal Ocean',    hex: '#1D6FA5' },
    { code: 'A07', name: 'Artkal Jade',     hex: '#2FA36B' },
    { code: 'A08', name: 'Artkal Olive',    hex: '#808000' },
    { code: 'A09', name: 'Artkal Walnut',   hex: '#5C4033' },
    { code: 'A10', name: 'Artkal Sandstone', hex: '#C2A878' },
    { code: 'A11', name: 'Artkal Slate',    hex: '#5A6B7C' },
    { code: 'A12', name: 'Artkal Coral',    hex: '#FF7F6B' }
  ];

  global.BEAD_PALETTE = PALETTE;
  global.BEAD_PALETTE_FULL_EXTRA = FULL_EXTRA;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PALETTE;
    module.exports.FULL_EXTRA = FULL_EXTRA;
  }
})(typeof window !== 'undefined' ? window : globalThis);
