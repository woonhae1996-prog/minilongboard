# 보드를 타보자! · Let's Ride the Board!

30초 동안 롱보드 위를 걸어 다니며 댄싱 트릭을 이어 가는 3D 웹 게임이에요.
A 3D web game: walk the longboard and chain dancing tricks for 30 seconds.

- 사이트 · Site: https://minilongbd.netlify.app
- 자세 미리보기 · Pose preview: https://minilongbd.netlify.app/pose.html
- made by @cloud._.sea · 자세 개선과 코드 정리 · poses & refactor: hallov012

## 폴더 구성 · Layout

| 경로 | 내용 |
| --- | --- |
| `public/index.html` | 게임 페이지 |
| `public/pose.html` | 자세 미리보기 페이지 (트릭 하나씩 반복 재생) |
| `public/css/style.css` | 화면 레이아웃과 색 |
| `public/js/game.js` | 프레임 루프, 판정, 3D 화면, 조작, 랭킹, 공유 |
| `public/js/pose/pose3.js` | 한 프레임의 사람 자세를 합치는 곳 |
| `public/js/pose/tricks.js` | 트릭별 발·보드 움직임 |
| `public/js/pose/solve.js` | 관절 계산 (다리 IK, 팔) |
| `public/js/pose-lab.js` | 자세 미리보기 버튼과 설명 |
| `public/og-image.png` | 링크 미리보기 대표 이미지 (1200×630) |
| `public/3d.html` | 예전 주소용 리다이렉트 |
| `netlify/edge-functions/share.js` | `/s/<id>` 결과 링크: 그 결과의 미리보기 태그를 붙여 게임 페이지를 내려줌 |
| `netlify.toml` | Netlify 설정 (`public` 폴더 배포, 예전 주소 리다이렉트) |
| `docs/game-logic.md` | 점수, 입력, 트릭 규칙 정리 |

## 로컬에서 실행 · Run locally

```bash
npx serve public
# 또는
python3 -m http.server -d public 8000
```

JS가 모듈(`type="module"`)이라 파일을 더블클릭해서 열면 안 되고, 위처럼 서버로 열어야 해요.
`/s/<id>` 결과 링크는 Netlify 엣지 함수라서 로컬에서는 `npx netlify dev`로 확인해요.

## 자세 스위치 · Pose switches

- `game.js`의 `NEW_POSES`: 미리보기에서 다듬은 자세(무릎 바깥, 착지 다운, 새 노컴플라이, 스핀 때 발 회전)를 게임에서도 쓸지 정해요. 지금은 켜져 있어요.
- 발 위치 간격(`POS`)은 자세 미리보기에서만 넓은 간격을 써요. 게임에서는 크로스스텝 때 다리가 교차하도록 원래 간격을 유지해요.

## 데이터 · Data (Supabase)

- `scores` 테이블: 랭킹 기록 (누구나 읽기·추가만 가능)
- `shares` 테이블 + `cards` 스토리지 버킷: 결과 링크와 미리보기 사진
- 코드에 들어 있는 키는 공개용 publishable key예요. 비밀 키(`sb_secret_…`, service_role)는 절대 넣지 마세요.

## 고치는 법 · Contributing

1. 브랜치를 만들어 고쳐요.
2. Pull request를 올리면 확인 후 합쳐요. `main`에 합쳐지면 Netlify가 자동으로 다시 배포해요.
