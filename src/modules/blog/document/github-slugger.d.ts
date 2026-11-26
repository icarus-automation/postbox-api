declare module 'github-slugger' {
  export default class GithubSlugger {
    constructor();
    slug(value: string, maintainCase?: boolean): string;
    reset(): void;
    static slug(value: string, maintainCase?: boolean): string;
  }
}
