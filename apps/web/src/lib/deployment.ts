/** Public files and router navigation share the same deployment root. */
export const presentationMode = import.meta.env.MODE === "presentation";
export const publicAsset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
