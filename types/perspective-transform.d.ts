declare module "perspective-transform" {
  interface PerspT {
    transform(x: number, y: number): [number, number];
    transformInverse(x: number, y: number): [number, number];
    coeffs: number[];
    coeffsInv: number[];
  }

  function PerspT(
    srcPts: number[],
    dstPts: number[],
  ): PerspT;

  export = PerspT;
}
