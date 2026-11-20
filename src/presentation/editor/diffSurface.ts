/** What the diff viewer needs to draw two versions of a file next to each other. Provided by the composition root. */
export interface SideBySideSurface {
  /** Draw `original` and `modified` inside `host`. Gives a function that removes them again. */
  mount(host: HTMLElement, original: string, modified: string, path: string): Promise<() => void>;
}

let surface: SideBySideSurface | null = null;

export function configureDiffSurface(next: SideBySideSurface): void {
  surface = next;
}

export const sideBySideSurface = (): SideBySideSurface | null => surface;
