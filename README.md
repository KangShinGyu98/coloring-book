# Printable Coloring Book Preset

사진이나 무료 이미지 소스를 집에서 바로 출력 가능한 컬러링북 도안으로 바꾸는 웹서비스를 목표로 합니다. 사용자는 직접 찍은 사진을 업로드하거나 서비스에서 제공하는 기본 도안을 선택하고, 흑백 컬러링북 스타일 이미지 또는 A4 PDF로 저장해 프린트할 수 있습니다.

## 비전

- 매번 새 컬러링북을 사거나 도안을 찾아야 하는 번거로움을 줄입니다.
- 아이의 관심사, 가족 사진, 반려동물, 장난감 등 개인화된 이미지를 도안으로 만들 수 있게 합니다.
- 최종 서비스에서는 난이도별 기본 도안, 이미지 변환, PDF 다운로드, 프린트 최적화를 제공합니다.

## 검증 단계

1. **AI 없이**
   - 현재 구현 단계입니다.
   - 이미지 처리 알고리즘만 사용해 사진을 흑백 선화로 변환합니다.
   - 빠르게 프로토타입 가능하지만 복잡한 배경이나 흐릿한 사진에서는 품질 한계가 있습니다.

2. **AI 혼용**
   - 기존 이미지 처리로 1차 선화를 만든 뒤, AI를 보조적으로 사용해 선 정리, 배경 제거, 난이도 조절을 개선합니다.

3. **AI**
   - API 사용 image-to-image 방식
   - 자체 AI 모델 사용 image-to-image 방식

## 현재 현황

- `images/` 폴더에 테스트용 이미지가 있습니다.
- `coloring_book_no_ai.py`로 AI 없이 컬러링북 스타일 이미지를 생성할 수 있습니다.
- 출력 형식은 PNG, JPG, PDF를 지원합니다.
- PDF는 A4 크기에 맞춰 중앙 배치됩니다.

## 실행 방법

필요 패키지:

```bash
pip install pillow numpy
```

PNG 생성:

```bash
python coloring_book_no_ai.py images/cat1.jpg
```

A4 PDF 생성:

```bash
python coloring_book_no_ai.py images/cat1.jpg -o outputs/cat1_coloring.pdf
```

더 단순한 도안으로 만들고 싶을 때:

```bash
python coloring_book_no_ai.py images/cat1.jpg -o outputs/cat1_simple.png --levels 3 --blur 6
```

사진 질감을 더 많이 살리고 싶을 때:

```bash
python coloring_book_no_ai.py images/cat1.jpg -o outputs/cat1_detail.png --style detail --threshold 15 --blur 1.4
```

선을 더 굵게 만들고 싶을 때:

```bash
python coloring_book_no_ai.py images/cat1.jpg -o outputs/cat1_bold.png --line-width 3
```

## 다음 작업

- 여러 이미지에 대해 변환 품질 비교
- 난이도별 프리셋 추가: 쉬움, 보통, 자세함
- 웹 업로드 화면과 다운로드 버튼 구현
- AI 혼용 방식의 품질 개선 가능성 검증
