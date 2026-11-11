# 개발 참고사항

이 저장소는 빌드 단계가 없는 정적 웹 게임이다. 배포할 파일은 `public/`에 있고, 결과 공유 링크만 `api/share.js`의 Vercel 함수가 처리한다.

## 로컬 확인

- `public/`을 정적 서버의 루트로 실행한다. 예를 들어 `npx serve public`을 사용한다. PowerShell의 스크립트 실행 정책으로 `npx`가 막히면 `npx.cmd serve public`을 사용한다. ES 모듈을 쓰므로 HTML 파일을 직접 열어서는 동작하지 않는다.
- `/ride.html`은 속도가 고정되고 시간 제한이 없는 주행 테스트, `/pose.html`은 개별 자세 미리보기, `/`는 실제 게임이다.
- JS 수정 후에는 변경한 모듈의 import URL과 `index.html`, `ride.html`, `pose.html`의 `game.js?v=...` 버전을 갱신해 브라우저가 새 파일을 읽게 한다.

## 자세와 위치

- 기본 발 위치는 `public/js/pose/foot-positions.js`의 `standingCenters`, `standingHalfWidth`, `standingPositions`가 정한다. `game.js`의 `POS`는 이 값을 참조한다. `pos`는 0 테일, 1 가운데 뒤, 2 가운데 앞, 3 노즈다.
- 시작 자세와 걷기 착지는 `POS`를 사용한다. 트릭의 발 궤적은 `public/js/pose/tricks.js`, 프레임별 자세 결합과 트릭 마지막 착지 보정은 `public/js/pose/pose3.js`, 동작 완료 후 상태 갱신은 `public/js/game.js`에 있다.
- A/B는 다리의 고정 식별자다. 몸이 180° 돌면 어느 발이 앞에 있는지는 바뀔 수 있다. 착지 좌표를 바꿀 때 다리 연결과 다음 동작의 `startFeet`까지 확인한다.
- `G.facing`은 0이 레귤러, 1이 구피다. `pose3.js`의 `stanceParameters`가 좌우 부호와 기본 회전각을 정하고, `applyActPose`가 레귤러 기준으로 계산한 트릭의 좌우 이동·회전을 한 번 반전한다. 180° 몸 회전 트릭의 완료 시점에는 `game.js`가 `G.facing`을 전환한다.
- 보드 길이의 발 위치는 `POS`의 0~1 비율이다. `game.js`의 `Xw`가 이 위치를 월드 X 좌표로 바꾼다. `pose3.js`는 좌우 반전을 마친 뒤 `G.worldZ`를 보드와 관절에 더한다. 좌표를 수정할 때 보드 기준 값과 월드 좌표를 구분한다.
- 보통 트릭은 `game.js`의 `endAct`에서 착지 위치와 방향을 확정한다. 고스트라이드는 `endGhost`를 사용하고, 피봇은 `endAct` 안의 별도 분기에서 칸을 바꾼다. 착지 칸을 수정할 때 화면 자세와 `G.pos`를 함께 맞춘다.

## 점수와 확인

- 트릭 점수와 버튼 표시값은 `game.js`의 `TRICKS`, `CAT`, 각 HTML 버튼에서 관리한다. 피봇 완료 점수는 `TRICKS.pivot.pts`를 참조한다. 점수를 바꾸면 `docs/game-logic.md`의 숫자도 맞춘다.
- 수정한 JS 파일에 `node --check`를 실행하고 `git diff --check`로 공백 오류를 확인한다. `node --check`는 실행 중 발생하는 오류를 잡지 못하므로, 자세 코드를 바꿨다면 주행에서 해당 트릭의 마지막 프레임과 연속 실행, 앞뒤 걷기, pose 미리보기의 레귤러·구피 자세를 확인한다.
