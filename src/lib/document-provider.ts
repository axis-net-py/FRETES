export function documentProvider() {
  const provider = process.env.GEMINI_API_KEY
    ? "gemini"
    : process.env.OPENAI_API_KEY
      ? "openai"
      : "none";
  return {
    provider,
    ready: provider !== "none",
    testOnly: provider === "gemini" && process.env.GEMINI_DATA_MODE !== "paid",
  };
}
