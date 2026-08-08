/**
 * The vendored viewer runtime ships as text so it can be embedded in the compiled binary and
 * written into a page that opens with no network. It is never executed here.
 */
declare module '*.txt' {
  const contents: string
  export default contents
}
