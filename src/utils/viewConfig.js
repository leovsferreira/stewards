export const USER_STUDY = import.meta.env.VITE_USER_STUDY === "1";

// zoom threshold where the micro view (editing tools, focus tile) engages.
// In study mode the map is full-width, so 18.5 shows several z18 tiles at
// once; engaging a bit closer keeps the focus tile unambiguous.
export const MICRO_ZOOM = USER_STUDY ? 19 : 18.5;
