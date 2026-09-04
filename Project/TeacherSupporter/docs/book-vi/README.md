# TeacherSupporter: Trọn bộ công nghệ — bản tiếng Việt

Bản dịch tiếng Việt của `docs/book/` (TeacherSupporter: The Complete Stack),
cùng cấu trúc file, cùng Appendix D nhúng trực tiếp các file cấu hình thật
trong repo. Quy ước dịch và bảng thuật ngữ: `TRANSLATION-GUIDE.md`.

## Build

```
cd docs/book-vi
%USERPROFILE%\tools\tectonic\tectonic.exe main.tex
```

Kết quả: `main.pdf`. Bản PDF được theo dõi trong git là
`docs/book/Self Study Guidance (Tieng Viet).pdf`.

## Khác biệt kỹ thuật so với bản gốc

- `tsbook.sty` dùng `fontspec` + font OpenType (TeX Gyre Pagella, Inconsolata)
  thay cho `newpxtext`/`fontenc T1`, vì font Type 1 của bản gốc không có
  glyph tiếng Việt. Tectonic chạy XeTeX nên không cần cài thêm gì.
- `babel` tiếng Việt cho tên tự động: Chương, Mục lục, Hình, Bảng, Phụ lục.
- Tiêu đề các hộp: quyết định / cạm bẫy / thực hành / trên phần cứng này /
  tự kiểm tra.

## Cập nhật

Khi một chương trong `docs/book/chapters/` thay đổi, dịch lại đúng file đó
sang `docs/book-vi/chapters/`, build lại, copy `main.pdf` sang tên PDF được
theo dõi, commit cả hai bản.
