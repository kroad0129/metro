import { LinesService } from './lines.service';

describe('LinesService', () => {
  let service: LinesService;

  beforeEach(() => {
    service = new LinesService();
  });

  it('9호선 역 38개를 order 순서대로 반환한다', () => {
    const stations = service.getStations('9');
    expect(stations).toHaveLength(38);
    expect(stations[0].name).toBe('개화');
    expect(stations[0].order).toBe(1);
    expect(stations[37].name).toBe('중앙보훈병원');
    expect(stations[37].order).toBe(38);
  });

  it('지원하지 않는 노선은 빈 배열을 반환한다', () => {
    expect(service.getStations('2')).toEqual([]);
    expect(service.getLine('2')).toBeNull();
  });

  it('stationId로 역을 찾는다', () => {
    const station = service.findStationById('9', '9-8');
    expect(station?.name).toBe('증미');
    expect(station?.order).toBe(8);
  });

  it('없는 stationId는 null을 반환한다', () => {
    expect(service.findStationById('9', '9-999')).toBeNull();
  });

  it('역 이름으로 역을 찾는다', () => {
    expect(service.findStationByName('9', '등촌')?.order).toBe(9);
  });

  it('역 이름의 앞뒤 공백과 "역" 접미사를 무시하고 찾는다', () => {
    expect(service.findStationByName('9', ' 등촌역 ')?.order).toBe(9);
  });

  it('없는 역 이름은 null을 반환한다', () => {
    expect(service.findStationByName('9', '강남')).toBeNull();
  });

  it('order로 역을 찾는다', () => {
    expect(service.getStationByOrder('9', 10)?.name).toBe('염창');
    expect(service.getStationByOrder('9', 0)).toBeNull();
    expect(service.getStationByOrder('9', 39)).toBeNull();
  });

  it('증미역은 급행 미정차역이다', () => {
    expect(service.findStationById('9', '9-8')?.isExpressStop).toBe(false);
  });

  it('김포공항역은 급행 정차역이다', () => {
    expect(service.findStationById('9', '9-2')?.isExpressStop).toBe(true);
  });
});
