// Lets TypeScript understand the CSS side-effect / module imports that Metro
// handles at bundle time (e.g. `@/global.css`, `*.module.css`).
declare module '*.css';
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
