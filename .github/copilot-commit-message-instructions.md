커밋 메시지는 Conventional Commits에 준해서 작성한다.
type과 optional scope는 영어 나머지 설명은 한글로 작성한다.

## Format

<type>[optional scope]: <description>

[optional body]

[optional footer(s)]

## Type

- feat: 기능의 추가
- fix: 버그 수정
- docs: 문서 수정저
- refactor: 신기능 추가 없이 코드의 구조 변경이나 위치 변경과 같은 경우
- test: 테스트 코드 작성, 수정저
- build: 빌드, 배포 관련 수정
- chore: 위 항목에 해당되지 않는 경우

## 예

refactor(core): 인증 처리 구조 개선

- JWT 토큰 갱신 추가
