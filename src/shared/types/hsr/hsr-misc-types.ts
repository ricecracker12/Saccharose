
export interface LoadingDesc {
  Id: number,

  TitleText: string,
  TitleTextMapHash: number,

  DescText: string,
  DescTextMapHash: number,

  ImagePath: number,
  MapEntranceId: number[],
  MaxLevel: number,
  MinLevel: number,
  MissionId: number,
  Weight: number,
}