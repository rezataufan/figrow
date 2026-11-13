declare module '@bramus/specificity' {
  export type SpecificityArray = [number, number, number];
  export interface SpecificityInstance {
    toArray(): SpecificityArray;
  }
  const Specificity: {
    calculate(selector: string): SpecificityInstance[];
  };
  export default Specificity;
}
