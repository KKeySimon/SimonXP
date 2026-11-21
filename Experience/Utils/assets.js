const base = import.meta.env.BASE_URL || './';

export default [
  {
    name: "room",
    type: "glbModel",
    path: `${base}models/roomFinaleFinale.glb`,
  },
  {
    name: "screen",
    type: "videoTexture",
    path: `${base}textures/portfolio.mp4`,
  },
];
