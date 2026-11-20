export const ISC_BRANCHES = [
  'ISC – Abu Dhabi: Khalifa City, Abu Dhabi',
  'ISC – Al Ain: Al Muwaiji (Ugdat Al Mutawaa), Al Ain',
  'ISC – Ajman: Al Tallah 2, Ajman',
  'ISC – Dubai: Hessa Street, Al Sufouh 2, Jumeirah, Dubai',
  'ISC – Dubai Investments Park (DIP): Dubai Investments Park 1, Dubai',
  'ISC – Ras Al Khaimah: Saqr Bin Mohd City / RAK, Ras Al Khaimah',
  'ISC – Sharjah: Industrial Area 6 / Sharjah',
  'ISC – Umm Al Quwain (ISC-UAQ): Khalifa City 1 / Al Salamah, Umm Al Quwain',
] as const;

export const SIS_BRANCHES = [
  'SIS – Aljada: Madar Street, Al Jada Center, Sharjah',
  'SIS – Ruwais: Ruwais, Abu Dhabi',
  'SIS – Yas Island: Yas Island, Abu Dhabi',
  'SIS – Al Bateen: Abu Dhabi',
] as const;

export const ALL_SABIS_BRANCHES = [...ISC_BRANCHES, ...SIS_BRANCHES] as const;
