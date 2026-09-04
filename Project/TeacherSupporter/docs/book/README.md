# TeacherSupporter: The Complete Stack (the book)

A self-contained LaTeX textbook teaching every technology in this project
(Spring Boot/Cloud, Postgres/Mongo/MinIO, Kafka, Docker, Kubernetes,
Jenkins CI/CD), using the repository's real configuration files as the
worked examples. Page size and grayscale design are tuned for e-ink
reading (XPPen Magic Notepad).

## Build

```
cd docs/book
%USERPROFILE%\tools\tectonic\tectonic.exe main.tex
```

Output: `main.pdf` (~150 pages). Tectonic downloads LaTeX packages on
first run; later builds are offline.

Appendix D includes the live configuration files via `\lstinputlisting`
with relative paths, so the book must be built from `docs/book/` inside
the repository — and it automatically stays in sync with the manifests.

## Layout

- `main.tex` — structure and includes
- `tsbook.sty` — page geometry, fonts, the box environments
  (decision / pitfall / hands-on / hardware / quiz), listing setup
- `frontmatter/`, `chapters/ch01..ch27`, `appendices/appA..appD`

## Bản tiếng Việt

A Vietnamese edition lives in `docs/book-vi/` (same structure, XeTeX fonts, translation
rules in `docs/book-vi/TRANSLATION-GUIDE.md`); tracked PDF: `Self Study Guidance (Tieng Viet).pdf`.
