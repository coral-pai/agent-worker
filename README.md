# agent-worker

이슈 트래커에서 티켓을 주기적으로 폴링해, 픽업한 작업을 AI 코딩 에이전트 (Claude Code, Codex) 에 위임하고 결과를 다시 트래커에 기록하는 자율 워커입니다. 한 번 설정해두면 사람이 매번 채팅창에 티켓을 옮겨붙이지 않아도 에이전트가 알아서 일을 받아 처리합니다.

![Agent Worker Demo](assets/demo.png)

---

## 무엇을 해주나

**구체적으로**는 다음 사이클을 무한히 반복합니다.

1. provider (Linear / GitHub Projects v2) 에서 `ready` 상태 + assignee 미지정 티켓을 폴링
2. 픽업한 티켓의 상태를 `in_progress` 로 전환 (다른 워커가 중복 픽업 못 하게 분산 락 역할)
3. 작업용 git 워크트리 + 브랜치를 자동으로 만들고
4. pre-hook 실행 → AI 에이전트 호출 → post-hook 실행 (예: 커밋 / 푸시 / PR 생성)
5. 성공이면 `in_review`, 실패면 `failed` 로 전환 + 결과 코멘트 작성
6. 다시 폴링으로 복귀

여기에 추가로, **PR 에 충돌이 생겼을 때 사람이 코멘트 한 번으로 Claude 가 충돌을 해결하게 시키는 GitHub Actions 워크플로우 템플릿**도 함께 제공합니다.

---

## 설계상의 결정

### 왜 폴링인가

웹훅 기반 자동화는 외부에서 들어오는 요청을 받아야 해서 포트·엔드포인트를 인터넷에 노출해야 합니다. agent-worker 는 반대로 **outbound 만** 합니다 — 내부에서 provider 로 주기적으로 질의해서 작업을 가져오는 구조라, 노트북에서도 사내 망에서도 같은 모델로 안전하게 운영 가능. 설정도 단순하고, 추가 인프라 (Reverse proxy, 인증서, 큐 등) 가 필요 없습니다.

### Hooks: 비결정성 길들이기

AI 에이전트는 강력하지만 비결정적이라, "무엇을 어떻게 만들지" 를 100% 예측할 수 없습니다. agent-worker 는 에이전트 호출 앞뒤를 **결정적인 셸 명령** 으로 감쌀 수 있게 해줍니다.

- **pre-hook**: 의존성 설치, 환경 검증, 시드 데이터 준비 등
- **post-hook**: 테스트, 린트, 커밋, 푸시, PR 생성, Slack 알림 등

한 명령이라도 실패하면 티켓은 즉시 `failed` 로 전환되고 에이전트가 호출되지 않거나 (pre 실패) 결과가 반영되지 않습니다 (post 실패). 에이전트는 창의적인 변경만 하고, process 는 hook 이 보장하는 구조.

### Provider / Harness 양쪽 모두 교체 가능

핵심 인터페이스는 두 개입니다.

- `TicketProvider` (`src/providers/types.ts`) — 티켓을 가져오고 상태 전환·코멘트 작성
- `CodeExecutor` (`src/pipeline/executor.ts`) — 프롬프트를 받아 코드 작업을 수행

각 인터페이스는 한 파일짜리 구현으로 추가됩니다. 현재 지원 목록:

| 종류 | 옵션 |
|---|---|
| **Provider** | Linear, GitHub Projects v2 |
| **Executor** | Claude Code, Codex |

---

## 사전 요구사항

- [Bun](https://bun.sh) 1.0+ — 런타임 / 빌드 / 테스트 도구
- 에이전트 하네스 중 하나가 시스템에 설치 + 인증돼 있어야 함
  - **Claude Code**: `claude` CLI ([설치 가이드](https://docs.anthropic.com/claude/docs/claude-code))
  - **Codex**: `codex` CLI ([설치 가이드](https://github.com/openai/codex))
- provider 계정 + API 토큰
  - **Linear**: [Linear API key](https://linear.app/settings/api) (Personal API key)
  - **GitHub Projects v2**: GitHub Personal Access Token (`project` scope 필수, private repo 면 `repo` scope 도)

---

## 설치

릴리즈에서 바이너리를 받거나, 소스에서 빌드:

```bash
git clone https://github.com/coral-pai/agent-worker
cd agent-worker
bun install
bun run build
```

빌드 결과: `dist/agent-worker`. 단일 실행 바이너리라 PATH 상의 디렉터리로 옮기거나 그대로 실행하면 됩니다.

크로스 플랫폼 빌드:

```bash
bun run build:darwin-arm64
bun run build:darwin-x64
bun run build:linux-x64
```

---

## 빠른 시작

### 1. 설정 파일 생성

```bash
cp agent-worker.example.yaml agent-worker.yaml
```

`agent-worker.yaml` 을 열어 본인 환경에 맞춰 수정합니다 (자세한 항목 설명은 [설정](#설정) 섹션 참고).

### 2. 환경 변수 설정

provider 에 따라 다음 중 하나가 필요합니다.

```bash
# Linear 사용 시
export LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxx

# GitHub Projects v2 사용 시 (`project` scope, private repo 면 `repo` 도)
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

### 3. 실행

```bash
agent-worker --config ./agent-worker.yaml
```

기본 동작:
- 60 초마다 provider 를 폴링
- 새 티켓이 있으면 한 번에 하나씩 처리
- foreground 프로세스로 동작 (SIGINT / SIGTERM 으로 graceful shutdown)
- 진행 상황은 splash + structured log 로 출력

---

## 설정

### 전체 예시

```yaml
provider:
  type: linear
  poll_interval_seconds: 60
  only_unassigned: true
  linear:
    project_id: "your-project-uuid"

lifecycle:
  ready: "Todo"
  in_progress: "In Progress"
  in_review: "In Review"
  failed: "Canceled"

repo:
  path: "/path/to/your/repo"

hooks:
  pre: []
  post:
    - "git add -A"
    - "git commit -m '{id}: {raw_title}'"
    - "git push origin {branch}"
    - "gh pr create --title '{id}: {raw_title}' --body 'Fixes {id}.' --base main"

executor:
  type: claude
  timeout_seconds: 300
  retries: 0

log:
  file: "./agent-worker.log"
  level: info
```

### `provider` — 티켓 출처

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `type` | `"linear"` \| `"github"` | — | 사용할 provider |
| `poll_interval_seconds` | number | `60` | 폴링 주기. 너무 짧으면 rate limit 위험, 너무 길면 응답성 저하 |
| `only_unassigned` | boolean | `true` | `true` 면 assignee 가 지정된 티켓은 건너뜀. 사람이 본인을 assignee 로 잡아두면 에이전트가 손대지 않게 됨 |
| `linear` | object | — | `type: linear` 일 때 필수 ([Linear 설정](#linear-설정) 참고) |
| `github` | object | — | `type: github` 일 때 필수 ([GitHub Projects 설정](#github-projects-v2-설정) 참고) |

### `lifecycle` — 상태 매핑

provider 의 실제 상태 옵션 이름 (대소문자 / 공백 정확히 일치) 을 4개 단계에 매핑합니다.

| 키 | 의미 |
|---|---|
| `ready` | 에이전트가 픽업할 후보로 표시되는 상태 |
| `in_progress` | 에이전트가 픽업한 직후 전환되는 상태 (분산 락 역할) |
| `in_review` | 파이프라인 (pre → 에이전트 → post) 이 모두 성공한 후 전환되는 상태 |
| `failed` | 어떤 단계에서든 실패한 경우 전환되는 상태 |

> **`in_review` → 최종 완료 (`Done`)** 전환은 **외부 자동화** 의 책임입니다. 예를 들어 GitHub Project 의 built-in workflow 에서 "Pull request merged → Status = Done" 을 켜두면, agent-worker 가 PR 만들면서 `in_review` 까지 옮긴 뒤 사람이 PR 을 머지하면 GitHub 이 자동으로 `Done` 으로 옮겨줍니다.

### `repo` — 작업 저장소

| 필드 | 타입 | 설명 |
|---|---|---|
| `path` | string | 에이전트가 작업할 git 저장소의 절대 경로 (필수) |

### `hooks` — 사전·사후 셸 명령

```yaml
hooks:
  pre: []                 # 에이전트 호출 BEFORE 실행할 명령 배열 (선택)
  post: [...]             # 에이전트 호출 AFTER 실행할 명령 배열 (선택)
```

- 명령들은 순서대로 실행됩니다. 한 명령이라도 non-zero exit 이면 즉시 중단되고 티켓은 `failed` 처리.
- pre 실패 → 에이전트가 아예 호출되지 않음
- post 실패 → 에이전트는 작업했지만 결과는 `failed` 로 기록 (에이전트의 변경사항은 워크트리 안에 있음)

**hook 명령에서 사용 가능한 변수:**

| 변수 | 값 |
|---|---|
| `{id}` | 티켓 식별자 (Linear: `ENG-42`, GitHub: `owner/repo#42`) |
| `{title}` | 슬러그 처리된 제목 (예: `add-login-page`) |
| `{raw_title}` | 원본 제목 (셸 안전 처리됨, 예: `Add login page`) |
| `{branch}` | 자동 생성된 브랜치 이름 (`agent/task-{id}`) |
| `{worktree}` | 에이전트가 실행되는 워크트리 경로 |
| `{date}` | 현재 시각 (ISO 8601) |

> **참고**: Claude executor 는 git 워크트리를 자동 생성하므로 pre-hook 에 `git checkout -b` 같은 브랜치 명령을 넣을 필요가 없습니다. Codex 는 자체 워크트리를 관리하므로 hook 은 원본 repo 경로에서 실행됩니다 ([워크트리 격리](#워크트리-격리) 참고).

### `executor` — 에이전트 하네스

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `type` | `"claude"` \| `"codex"` | `"claude"` | 사용할 하네스 |
| `timeout_seconds` | number | `300` | 에이전트 실행 시간 상한. 초과 시 프로세스 kill + `failed` |
| `retries` | number (0–3) | `0` | 실패 시 재시도 횟수. 전체 파이프라인 (pre → 에이전트 → post) 단위로 재시도 |

### `log` — 로깅

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `file` | string | (없음) | 로그 파일 경로. 생략 시 stdout 으로만 출력 |
| `level` | `"debug"` \| `"info"` \| `"warn"` \| `"error"` | `"info"` | 로그 레벨 |

---

## Provider 별 설정

### Linear 설정

```yaml
provider:
  type: linear
  poll_interval_seconds: 60
  only_unassigned: true
  linear:
    project_id: "ddc4cb85-a4ae-4063-84e9-7684cd747379"
```

**`project_id` 찾는 법**: Linear → Settings → Projects → 프로젝트 클릭 → URL 의 마지막 UUID 부분.

**필요한 환경 변수**: `LINEAR_API_KEY` ([발급 위치](https://linear.app/settings/api))

**상태 매핑**: `lifecycle.{ready,in_progress,in_review,failed}` 의 값들이 Linear 팀 워크플로 상태 이름과 정확히 일치해야 합니다 (Linear 의 default: `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`. 옵션 추가는 Settings → Workspace → Workflow).

**동작**: Linear GraphQL API (via `@linear/sdk`) 로 `project + state.name + assignee` 필터로 issue 목록을 가져옵니다.

### GitHub Projects v2 설정

```yaml
provider:
  type: github
  poll_interval_seconds: 60
  only_unassigned: true
  github:
    owner: "your-org-or-user"
    owner_type: organization        # 또는 "user"
    project_number: 1
    status_field_name: "Status"
```

**`project_number` 찾는 법**: Project URL 의 마지막 숫자.
- 조직 프로젝트: `github.com/orgs/<owner>/projects/<N>` → `owner_type: organization`, `project_number: <N>`
- 개인 프로젝트: `github.com/users/<owner>/projects/<N>` → `owner_type: user`, `project_number: <N>`

**필요한 환경 변수**: `GITHUB_TOKEN` ([Personal Access Token](https://github.com/settings/tokens))
- `project` scope 필수
- private repo 의 issue/PR 작업 시 `repo` scope 도

**상태 옵션**: GitHub Project 에 single-select 필드 (보통 기본 제공되는 `Status`) 가 있어야 하고, `lifecycle` 의 4개 값과 정확히 일치하는 옵션이 필드에 등록돼 있어야 합니다.
- 기본 제공: `Todo`, `In Progress`, `Done`
- `In Review`, `Canceled` 등은 직접 추가 필요 (Project Settings → Custom fields → Status → New option)
- 다른 이름의 single-select 필드를 쓰려면 `status_field_name` 으로 지정

**동작**: GitHub GraphQL API (via `@octokit/graphql`) 로 project items 를 페이지네이션 해서 가져온 뒤, client-side 에서 status 필드 값과 assignee 수로 필터링. PR 이나 draft item 은 자동으로 스킵하고 issue 만 처리합니다.

**티켓 ID 인코딩**: GitHub 의 경우 `transitionStatus` 에는 project item ID, `postComment` 에는 issue node ID 가 필요해서, 내부적으로 `<projectItemId>|<issueId>` 형태의 합성 ID 를 사용합니다. 사용자에겐 보이지 않는 구현 디테일.

---

## 워크트리 격리

Claude executor 는 매 티켓마다 **독립된 git 워크트리** 를 자동으로 만듭니다.

```
원본 repo: /Users/me/Desktop/calc                  ← repo.path
  └─ main, feature-branches, ...                   ← 사용자가 평소 작업하는 공간

워크트리: /tmp/agent-worker-agent/task-ENG-42      ← 매 티켓마다 새로 생성됨
  └─ agent/task-ENG-42 브랜치                      ← main 의 HEAD 에서 분기
```

이 구조 덕분에:
- 에이전트의 변경이 사용자가 작업 중인 파일에 영향 안 줌
- 여러 워커가 동시에 같은 repo 를 가리켜도 충돌 없음 (각자 별도 워크트리 + 브랜치)
- 작업 끝나면 워크트리는 자동 정리

**Codex 는 자체적으로 isolation 메커니즘을 가지고 있어** agent-worker 가 추가 워크트리를 만들지 않습니다. Codex 사용 시 hook 은 원본 `repo.path` 에서 실행됩니다.

이 동작은 `CodeExecutor.needsWorktree` 플래그로 제어됩니다 — 새 executor 를 만들 때 `true` 로 설정하면 자동 워크트리, `false` 면 본인이 알아서 isolation 처리.

---

## 병렬 실행

워크트리 격리 덕분에 같은 repo 를 가리키는 워커를 **여러 개** 동시에 띄울 수 있습니다.

```bash
# Terminal 1
agent-worker --config ./agent-worker.yaml

# Terminal 2
agent-worker --config ./agent-worker.yaml
```

각 프로세스가:
- 서로 다른 티켓을 픽업 (claim 시 status 를 `in_progress` 로 전환하는 것이 분산 락 역할)
- 별도 워크트리 + 브랜치에서 작업
- post-hook 의 PR 도 각자 별도

병렬로 만든 PR 들끼리 충돌이 생길 수 있는데 — 이건 [PR 충돌 해결](#pr-충돌-해결-optional) 섹션의 GitHub Actions 워크플로우로 해결합니다.

---

## Executor

### Claude Code

```
claude --print --dangerously-skip-permissions -p "<프롬프트>"
```

| 플래그 | 의미 |
|---|---|
| `--print` | 비대화형 모드. 프롬프트를 입력으로 받고, 작업한 뒤 종료 |
| `--dangerously-skip-permissions` | 매 도구 사용마다 묻는 권한 프롬프트를 건너뜀 (자율 실행에 필수) |
| `-p` | 초기 프롬프트로 티켓 제목 + 본문 전달 |

stdout / stderr 는 실시간으로 agent-worker 의 로그에 스트리밍되고, exit code 0 이면 성공으로 처리.

#### `CLAUDE.md` — 프로젝트 별 컨텍스트

repo 루트에 `CLAUDE.md` 파일이 있으면 Claude Code 는 매 실행 시 그 파일을 읽습니다. 프로젝트 컨벤션이나 stack 정보 등을 적어두면 에이전트가 알아서 따라줍니다.

```markdown
# My Project

## Stack
- Runtime: Bun
- Language: TypeScript
- Testing: `bun test`

## Conventions
- 클래스 사용 X — 함수와 인터페이스만
- API 라우트는 모두 /api/v1/ 아래
```

워크트리는 매번 `git worktree add` 로 만들어지므로 `CLAUDE.md` 가 main 브랜치에 커밋돼 있어야 자동으로 워크트리에도 들어옵니다.

### Codex

OpenAI Codex CLI 를 wrap. 자세한 설정과 사용법은 [`docs/codex-executor.md`](docs/codex-executor.md) 참고.

핵심 차이:
- 자체 워크트리 관리 → agent-worker 가 git worktree 생성 안 함
- hook 들이 원본 `repo.path` 에서 실행됨

### 새 executor 추가

`CodeExecutor` 인터페이스 (`src/pipeline/executor.ts`) 를 구현하는 파일을 추가하고, `createExecutor` switch 에 case 한 줄을 추가하면 됩니다. 약 50 줄.

---

## PR 충돌 해결 (optional)

여러 워커가 만든 PR 이 서로 충돌할 수 있습니다. `examples/github-actions/agent-resolve.yml` 은 PR 코멘트로 Claude 에게 충돌 해결을 시키는 GitHub Actions 워크플로우 템플릿이에요.

### 셋업 (target repo, 즉 PR 이 열리는 저장소)

1. **GitHub App 설치**: https://github.com/apps/claude → "Install" → target repo 선택
2. **Secret 등록**: target repo Settings → Secrets and variables → Actions
   - `CLAUDE_CODE_OAUTH_TOKEN` (Pro / Max 구독자: 본인 컴퓨터에서 `claude setup-token` 실행해서 발급)
   - 또는 `ANTHROPIC_API_KEY` (API key 발급받은 사용자)
3. **워크플로우 파일 복사**: `examples/github-actions/agent-resolve.yml` → target repo 의 `.github/workflows/agent-resolve.yml`

### 사용 방법

충돌이 생긴 PR 에 다음과 같이 코멘트 작성:

```
/agent-worker resolve
```

또는 힌트 첨부:

```
/agent-worker resolve — main 쪽의 시그니처 변경을 우선하고, 내 변경은 그쪽에 맞춰 리네임해줘
```

워크플로우가 자동으로:
1. PR 페이지 하단에 "agent-worker/resolve — pending" 표시
2. PR 브랜치 체크아웃 후 `git merge origin/main` 시도
3. 충돌 마커 분석 → Claude 가 코멘트의 힌트와 코드 의도를 보고 해결
4. resolution commit 을 PR 브랜치에 push
5. 진행 결과를 PR 코멘트로 보고 (한국어)
6. status 를 success / failure 로 갱신

**머지 자체는 사람이 직접 합니다** — 워크플로우는 충돌만 해결하고, 머지 결정은 리뷰어 책임.

### 권한 / 보안

- 트리거 권한: 작성자가 repo 의 write 권한 이상 (OWNER / COLLABORATOR / MEMBER) 일 때만 발동. 외부 contributor 는 못 띄움.
- 봇 코멘트는 무시: Claude 의 답변에 트리거 phrase 가 포함돼도 재진입 루프 안 남
- 트리거 phrase 는 substring 매치이지만 `/agent-worker resolve` 가 24자 고유 조합이라 우연한 매치 거의 없음

---

## 트러블슈팅

### "Configuration error: ..."

`agent-worker.yaml` 의 schema 검증 실패. 에러 메시지에 어떤 필드가 문제인지 표시됩니다. 자주 빠뜨리는 것:
- `provider.type` 과 실제 채운 블록 (`linear:` vs `github:`) 이 일치하는지
- `lifecycle` 4개 필드 모두 존재하는지
- `repo.path` 가 절대 경로인지

### "LINEAR_API_KEY environment variable is required" / "GITHUB_TOKEN environment variable is required"

환경 변수가 셸에 export 안 된 상태로 실행. mise 같은 도구 쓰면 `mise.toml` 의 `[env]` 섹션에 두는 것도 방법 (단, `mise.toml` 은 secret 포함하면 .gitignore 처리 필수).

### `Status "X" is not an option on the "..." field` / `Status "X" not found on team`

provider 쪽에 해당 이름의 상태 옵션이 없음. provider 화면에서 직접 옵션 추가 (GitHub: Project → Settings → Custom fields → Status → New option / Linear: Settings → Workflow).

### 티켓이 픽업되지 않음

다음 순서로 확인:
1. **assignee 지정 안 된 상태인지** — `only_unassigned: true` (기본값) 면 assignee 있는 티켓은 건너뜁니다. 분리 정책이 의도면 OK, 아니면 본인을 assignee 에서 빼거나 `only_unassigned: false` 설정
2. **상태가 `lifecycle.ready` 와 정확히 일치** 하는지 — 대소문자 / 공백 / 특수문자 모두 일치해야 함
3. **GitHub 의 경우 issue 인지** — pull request 나 draft item 은 스킵
4. 로그를 `level: debug` 로 올려서 폴링 결과 확인

### Conflict resolution workflow 가 안 뜸

`issue_comment` 이벤트로 트리거되는 워크플로우는 PR Checks 탭에 표시되지 않습니다. **저장소 Actions 탭** 에서 확인하거나, 템플릿에 포함된 commit status 가 PR 페이지 하단 (머지 영역) 에 표시되니 그쪽 활용.

---

## 개발

```bash
bun install         # 의존성 설치
bun test            # 테스트 실행
bun run build       # 단일 바이너리 컴파일 → dist/agent-worker
```

크로스 플랫폼 빌드:

```bash
bun run build:darwin-arm64
bun run build:darwin-x64
bun run build:linux-x64
```

### 코드 구조

```
src/
  config.ts                    Zod 스키마 + loadConfig
  index.ts                     엔트리 포인트
  poller.ts                    polling loop
  scheduler.ts                 단일 티켓 처리 흐름 (claim → pipeline → finalize)
  logger.ts                    structured logging
  format.ts                    splash + console 색상 포맷
  providers/
    types.ts                   TicketProvider, ProviderBundle, Ticket
    factory.ts                 provider 팩토리 (type → 구현체)
    linear.ts                  Linear 구현
    github.ts                  GitHub Projects v2 구현
    _shared/backoff.ts         rate limit 재시도 헬퍼
  pipeline/
    executor.ts                CodeExecutor + 팩토리
    claude-executor.ts         Claude Code 실행
    codex-executor.ts          Codex 실행
    pipeline.ts                pre → 에이전트 → post 묶음 (워크트리 포함)
    hook-runner.ts             셸 명령 실행
    interpolate.ts             {id} {title} ... 변수 치환
test/                          src/ 와 동일 구조로 미러링
examples/github-actions/       PR conflict resolution 워크플로우 템플릿
docs/                          상세 설계 / 사용 가이드 문서
```

---

## 라이선스

MIT
