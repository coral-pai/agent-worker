# React Counter Demo

독립 실행 가능한 React 카운터 예제입니다. 기존 `agent-worker` CLI와 분리되어 있어 저장소 성격을 해치지 않고 확인할 수 있습니다.

## Run

정적 파일만 사용하므로 아무 HTTP 서버로 열면 됩니다.

```bash
cd examples/counter
python3 -m http.server 8080
```

그 다음 브라우저에서 `http://127.0.0.1:8080`을 열면 됩니다.
