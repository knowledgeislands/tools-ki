/**
 * A text asset, such as the banner's art, ships as text so that Bun embeds it in the compiled binary;
 * it is never executed.
 */
declare module '*.txt' {
  const contents: string
  export default contents
}
