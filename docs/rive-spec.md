# 캐릭터 Rive 스펙 — 별 → 토끼/공룡

앱 코드가 이 이름들을 문자열로 참조한다. **철자·대소문자가 다르면 조용히 무시된다.**
파일 위치: `assets/characters/character.riv`

## 구조

- **Artboard**: `Character` (정사각, 500×500 권장)
- **State Machine**: `SM` (하나만)

## Inputs

| 이름 | 타입 | 값 | 앱이 언제 바꾸나 |
|---|---|---|---|
| `level` | Number | 0~5 | 활동 누적에 따라 성장 단계 |
| `species` | Number | 0=미정(별), 1=토끼, 2=공룡 | 온보딩 선택 / 진화 시점에 확정 |
| `tap` | Trigger | — | 아이가 캐릭터를 탭 |
| `celebrate` | Trigger | — | 퀴즈 정답·활동 완료 |
| `evolve` | Trigger | — | 레벨업으로 형태가 바뀌는 순간 1회 |

## 상태 흐름

```
Star(level 0~2) --evolve--> Rabbit(species=1) 또는 Dino(species=2) --> level 3~5로 성장
```

- 기본 상태는 `Star idle`
- `evolve` 트리거 → `species` 값에 따라 Rabbit / Dino 진화 애니메이션 1회 재생 → 각자 idle로 안착
- `level`은 크기·장식(스케치 3단계의 지팡이·별 소품)을 연속 변화시키는 데 사용

## 애니메이션 최소 세트

각 종(Star / Rabbit / Dino)마다:
- `idle` — 위아래 6px, 1.4초, Loop
- `tap` — 스케일 1 → 0.9 → 1.06 → 1, 0.4초 (Exit Time으로 idle 복귀)
- `celebrate` — 점프 1회 + 반짝임, 0.8초

전환용:
- `evolveRabbit`, `evolveDino` — 별이 부풀었다 형태가 바뀌는 1회 재생 (1~1.5초)

## Listener (선택)

몸통 도형에 Pointer Down → `tap` 발동. 넣으면 앱이 탭을 넘기지 않아도 반응한다.
앱도 별도로 `tap`을 쏘므로 둘 중 하나만 있어도 동작한다.

## Export

Export → **Runtime (.riv)** → `assets/characters/character.riv`

## 앱 연결 (파일 오면 코드가 하는 일)

```js
riveRef.current?.fireState('SM', 'tap');
riveRef.current?.fireState('SM', 'celebrate');
riveRef.current?.setInputState('SM', 'level', 3);
riveRef.current?.setInputState('SM', 'species', 1); // 1=토끼, 2=공룡
riveRef.current?.fireState('SM', 'evolve');
```

`PattiCharacter` 한 컴포넌트 내부만 교체하면 되고, 호출부(홈·온보딩·활동 완료 등 7곳)는 손대지 않는다.
`rive-react-native`는 이미 dev build에 포함되어 네이티브 재빌드가 필요 없다.

## 주의

- 아트보드를 종별로 나누지 말고 **하나에 다 넣는다**. 나누면 진화 전환을 코드에서 이어붙여야 한다.
- 히트 영역은 아이 손가락 기준으로 넉넉히 (투명 도형을 캐릭터보다 20% 크게 덮으면 편하다).
- 파일이 커지면 첫 로드가 느리다. 장식은 벡터로, 비트맵 임베드는 최소화.
- 소스 이미지: `assets/characters/star.png` (436×436, 배경 투명 처리 완료)
