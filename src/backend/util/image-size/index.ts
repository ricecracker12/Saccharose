export { types } from './types';

export { imageSize, imageSize as default, disableTypes } from './lookup.ts';
export { imageSizeFromFile, setConcurrency } from './fromFile.ts';

export interface ISize {
  width: number;
  height: number;
  orientation?: number;
  type?: string;
}

export type ISizeCalculationResult = {
  images?: ISize[]
} & ISize

export interface IImage {
  validate: (input: Uint8Array) => boolean;
  calculate: (input: Uint8Array) => ISizeCalculationResult;
}
