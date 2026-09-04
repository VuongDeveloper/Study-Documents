# Hướng dẫn dịch — TeacherSupporter: The Complete Stack (bản tiếng Việt)

Bản dịch giữ nguyên cấu trúc LaTeX của bản gốc trong `docs/book/`. Mỗi file
`.tex` ở đây là bản dịch 1:1 của file cùng tên bên đó. Khi bản gốc thay đổi,
dịch lại đúng file đó.

## Quy tắc bất di bất dịch (LaTeX)

1. **Không đổi cấu trúc.** Giữ nguyên mọi `\chapter`, `\section`, `\label`,
   `\ref`, `\cite`, `\begin{...}`/`\end{...}`, `\lstinputlisting`, đường dẫn
   file, `\co{n}`, `\code{...}`, `\emph`, `\textbf`, bảng, hình.
2. **Không dịch nội dung code.** Mọi thứ trong `\code{}`, `\texttt{}`,
   `lstlisting`, `verbatim`, tên file, tên biến môi trường, URL, lệnh shell,
   YAML, Java giữ nguyên tuyệt đối — kể cả comment tiếng Anh bên trong
   listing, vì listing phản chiếu file thật trong repo.
3. **Hình tikz:** giữ nguyên toàn bộ. Chỉ dịch nhãn là câu/cụm từ tiếng Anh
   thuần (ví dụ `instance 1` → `phiên bản 1`) khi bản dịch không dài hơn
   bản gốc; tên service, cổng, tên object giữ nguyên.
4. **Tham chiếu chéo:** `Chapter~4` → `Chương~4`; `Appendix~A` → `Phụ lục~A`;
   `Ch.\,1` → `Ch.~1` (viết tắt của Chương, dùng trong Glossary); `Part~V` →
   `Phần~V`; `Figure~2.1` → `Hình~2.1`; `Table` → `Bảng`; `Section` → `Mục`.
5. **Tiêu đề chương/mục:** dịch. Tiêu đề chương đặt tên công nghệ sau dấu hai
   chấm như bản gốc: `\chapter{Khám phá dịch vụ: Eureka}`.
6. **Môi trường hộp** (`decision`, `pitfall`, `handson`, `hardware`, `quiz`):
   giữ tên môi trường; dịch tham số tiêu đề tùy chọn `[...]` và nội dung.
7. **Dấu câu LaTeX:** giữ `---` (gạch dài), `\,`, `~`, ` `` ` và `''` cho
   ngoặc kép.
8. Encoding UTF-8, xuống dòng LF. Không thêm gói LaTeX mới.

## Giọng văn

- Sách kỹ thuật tự học, xưng hô với người đọc là **bạn**; tác giả là
  **chúng ta** khi cùng làm, tránh "tôi".
- Dịch **nghĩa**, không dịch từng chữ. Câu tiếng Việt ngắn, chủ động. Giữ
  cách viết trực tiếp, hơi dí dỏm của bản gốc; không thêm giải thích.
- Giữ độ dài tương đương bản gốc (trang sách khổ nhỏ, hình đã căn theo
  bản gốc).

## Thuật ngữ

**Nguyên tắc của tác giả:** CI/CD và mọi từ viết tắt, mọi tên sản phẩm giữ
nguyên tiếng Anh. Không dịch: CI/CD, CI, CD, API, REST, HTTP, HTTPS, DNS,
TLS, JWT, OAuth2, TOTP, 2FA, JVM, JDK, JRE, SQL, YAML, JSON, S3, IP, TCP, URL,
URI, PVC, PV, RBAC, CRD, CORS, SPA, CDN, SMTP, KRaft, GitOps, DLQ, RED, SAN,
UID, OOM, CPU, RAM, SSD, LAN, MagicDNS.

Tên sản phẩm/công nghệ giữ nguyên: Spring Boot, Spring Cloud, Eureka, Config
Server, Gateway (Spring Cloud Gateway), Feign, Resilience4j, Flyway, Kafka,
Strimzi, Docker, Docker Compose, Jib, Kubernetes, k3s, Traefik, Kustomize,
Helm, Jenkins, Argo CD, Postgres/PostgreSQL, MongoDB, MinIO, Zipkin,
Prometheus, Grafana, MailDev, Tailscale, OpenShift, Maven, nginx, Vite, React.

Object của Kubernetes giữ nguyên tiếng Anh, viết hoa như tài liệu gốc: Pod,
Deployment, Service, Ingress, StatefulSet, ConfigMap, Secret, Namespace,
PersistentVolumeClaim, Job, CronJob, ServiceAccount, Role, RoleBinding,
Node, ReplicaSet, DaemonSet, Endpoints, IngressClass, StorageClass.

Thuật ngữ Kafka giữ theo cách cộng đồng Việt Nam dùng: topic, partition
(có thể viết "phân vùng (partition)" lần đầu), offset, broker, producer,
consumer, consumer group, listener, advertised listener, bootstrap servers,
retention, replication factor, leader, follower, ISR, commit, rebalance.

Từ dùng lẫn tiếng Anh (phổ biến trong giới dev Việt Nam, giữ nguyên):
container, image, registry, tag, layer, manifest, pipeline, build, artifact,
job, stage, agent, runner, webhook, commit, branch, merge, push, pull,
rollout, rollback, replica, probe (liveness/readiness/startup probe),
volume, mount, namespace, label, selector, annotation, controller, operator,
reconcile/reconciliation ("vòng lặp điều hòa" nếu cần giải thích), sidecar,
endpoint, request/response, header, cookie, token, secret (object k8s),
schema, migration, index (DB), transaction (có thể "giao dịch"), lock,
cache, log, trace, span, metric, dashboard, alert, healthcheck, timeout,
retry, fallback, circuit breaker ("bộ ngắt mạch" khi giải thích khái niệm),
bulkhead, rate limit, load balancer.

Khái niệm — dịch sang tiếng Việt (lần đầu xuất hiện trong chương có thể kèm
tiếng Anh trong ngoặc):

| Tiếng Anh | Tiếng Việt |
|---|---|
| service discovery | khám phá dịch vụ |
| load balancing | cân bằng tải |
| client-side / server-side | phía client / phía server |
| configuration / config | cấu hình |
| property | thuộc tính (cấu hình) |
| environment variable | biến môi trường |
| profile (Spring) | profile |
| deployment (hành động) | triển khai |
| orchestration | điều phối |
| cluster | cụm (cluster) |
| authentication | xác thực |
| authorization | phân quyền |
| hashing / hash | băm / mã băm |
| signing / signature | ký / chữ ký |
| encryption | mã hóa |
| access token / refresh token | access token / refresh token |
| stateless | phi trạng thái (stateless) |
| filter chain | chuỗi filter |
| eventual consistency | nhất quán cuối cùng |
| database per service | mỗi service một cơ sở dữ liệu |
| foreign key | khóa ngoại |
| primary key | khóa chính |
| query | truy vấn |
| document (Mongo) | document |
| object storage | lưu trữ đối tượng |
| bucket / key | bucket / key |
| presigned URL | presigned URL |
| message | thông điệp (message) |
| event | sự kiện (event) |
| command | lệnh (command) |
| at-least-once / at-most-once / exactly-once | ít nhất một lần / nhiều nhất một lần / đúng một lần |
| idempotent | lũy đẳng (idempotent) |
| dead-letter topic | dead-letter topic |
| serialization / deserialization | tuần tự hóa / giải tuần tự |
| consumer lag | độ trễ tiêu thụ (consumer lag) |
| observability | khả năng quan sát (observability) |
| distributed tracing | truy vết phân tán |
| sampling | lấy mẫu |
| health check | kiểm tra sức khỏe (health check) |
| liveness / readiness | liveness / readiness |
| resource requests / limits | requests / limits tài nguyên |
| desired state / actual state | trạng thái mong muốn / trạng thái thực tế |
| reconciliation loop | vòng lặp điều hòa (reconciliation) |
| control plane | control plane |
| scheduling / scheduler | lập lịch / bộ lập lịch |
| persistent storage | lưu trữ bền vững |
| ephemeral | tạm thời (ephemeral) |
| immutable | bất biến |
| declarative / imperative | khai báo / mệnh lệnh |
| drift | trôi (drift) cấu hình |
| prune | dọn (prune) |
| overlay (Kustomize) | overlay |
| base image | image gốc |
| multi-stage build | build nhiều giai đoạn (multi-stage) |
| layer caching | cache theo layer |
| non-root | không chạy bằng root |
| continuous integration / delivery / deployment | giữ nguyên: CI / CD (nếu cần giải thích: tích hợp liên tục / chuyển giao liên tục / triển khai liên tục) |
| push-based / pull-based | đẩy / kéo (push / pull) |
| blue-green / canary | blue-green / canary |
| rolling update | cập nhật cuốn chiếu (rolling update) |
| single point of failure | điểm lỗi đơn |
| cascading failure | lỗi dây chuyền |
| backpressure | áp lực ngược (backpressure) |
| throughput / latency | thông lượng / độ trễ |
| scalability | khả năng mở rộng |
| fault tolerance | khả năng chịu lỗi |
| high availability | tính sẵn sàng cao |
| trade-off | đánh đổi |
| anti-pattern | anti-pattern |
| best practice | thực hành tốt |
| boilerplate | mã lặp (boilerplate) |
| monolith | monolith (ứng dụng nguyên khối) |
| microservice | microservice |
| edge (router) | biên (edge) |
| reverse proxy | reverse proxy |
| self-preservation (Eureka) | chế độ tự bảo toàn (self-preservation) |
| heartbeat | heartbeat |
| lease / eviction | lease / loại bỏ (evict) |
| hosts file | file hosts |
| interview | phỏng vấn |
| résumé material | điểm cộng cho CV |

Tiêu đề các phần (`\part`): Ứng dụng · Dữ liệu · Truyền thông điệp ·
Container · Kubernetes · CI/CD · Vận hành và chặng đường phía trước.

Tên các phụ lục: A Đáp án tự kiểm tra · B Thuật ngữ · C Bảng tra nhanh ·
D Các file cấu hình.
