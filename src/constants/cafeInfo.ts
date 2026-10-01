// Single source of truth for Cafe Aadvikam's contact details. Previously
// duplicated three ways with drifted values (src/pages/Landing.tsx had
// '7 AM – 10 PM', src/constants/config.ts and ChatBot.tsx both had the wrong
// '6 AM – 10 PM') — confirmed with the business owner that 7 AM – 10 PM and
// +91 90954 45444 are correct. Every other file should import from here
// instead of hardcoding its own copy.
export const CAFE_INFO = {
  address: '109 Bagalur Main Road, Berikai 635105',
  hours: '7 AM – 10 PM Daily',
  phone: '+91 90954 45444',
  whatsapp: '919095445444',
  mapsQuery: 'Cafe Aadvikam 109 Bagalur Main Road Berikai 635105',
  // The place-with-coordinates link (more precise pin than a text search).
  mapsPlaceUrl:
    'https://www.google.com/maps/place/Cafe+Aadvikam/@12.808481,77.9602846,17z/data=!4m6!3m5!1s0x3baddf00120caa5f:0x7cf353554e2c66a9!8m2!3d12.808481!4d77.9628595!16s%2Fg%2F11z0zvhx9p',
};

export const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(CAFE_INFO.mapsQuery)}`;
export const mapsEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(CAFE_INFO.mapsQuery)}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
