# 롱보더 사주

생일을 넣으면 태어난 날의 일주(日柱)로 롱보드 라이딩 타입, 2027년 운세, 찰떡 크루를 알려 주는 한 페이지 사이트예요.

- 사이트: https://longboard-saju.vercel.app
- 게임: [보드를 타보자!](https://minilongboard.vercel.app)
- made by @cloud._.sea

## 파일

| 경로 | 내용 |
| --- | --- |
| `index.html` | 페이지 전체 (HTML + CSS + JS 한 파일) |
| `og-image.png` | 링크 미리보기 이미지 (1200×630) |

## 계산

일주는 율리우스 적일(JDN)로 구해요. `(JDN + 49) mod 60`이 0이면 甲子일이에요. 천간 10개가 라이딩 타입 10개, 오행(木火土金水)이 데크·휠 색과 2027 丁未년 운세를 정해요.

## 로컬에서 보기

```bash
python3 -m http.server 8000
```

`main`에 올리면 Vercel이 자동으로 다시 배포해요.
