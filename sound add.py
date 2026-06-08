import tkinter as tk
from tkinter import messagebox
import re
import os
import urllib.request

os.chdir(os.path.dirname(os.path.abspath(__file__)))

JS_FILE = "options-audio.js"


def convert_url(url):
    """يحوّل رابط الصفحة إلى رابط mp3 — يجرب نسختين من الاسم."""
    url = url.strip()
    if url.endswith(".mp3"):
        return url
    match = re.search(r'/instant/([^/?#]+)', url)
    if match:
        slug = match.group(1).rstrip("/")
        return "https://www.myinstants.com/media/sounds/" + slug + ".mp3"
    raise ValueError("Cannot parse URL: " + url)


def slug_variants(mp3_url):
    """يولّد نسختين من اسم الملف:
       1) الاسم كما هو:      dexter-meme-26140.mp3
       2) بدون أرقام النهاية: dexter-meme.mp3
    """
    base = mp3_url.rsplit("/", 1)[-1].replace(".mp3", "")   # e.g. dexter-meme-26140
    variants = [mp3_url]
    # احذف -DIGITS من النهاية إذا موجودة
    short = re.sub(r"-\d+$", "", base)
    if short != base:
        short_url = mp3_url.rsplit("/", 1)[0] + "/" + short + ".mp3"
        variants.append(short_url)
    return variants


def check_url(url):
    """يجرب الرابط الأصلي + نسخة بدون أرقام النهاية.
       يعيد (url_الصحيح, ok, reason)."""
    for candidate in slug_variants(url):
        try:
            req = urllib.request.Request(candidate, method="HEAD",
                                         headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=6) as r:
                if r.status == 200:
                    return candidate, True, "ok"
        except urllib.error.HTTPError:
            continue
        except Exception:
            continue
    return url, False, "الملف غير موجود على السيرفر"


def read_sources(path):
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    matches = re.findall(r'"(https://[^"]+\.mp3)"', content)
    return matches


def write_sources(path, sources):
    if not os.path.exists(path):
        messagebox.showerror("Error", "File not found:\n" + path)
        return False
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    if sources:
        lines = ',\n        '.join('"' + s + '"' for s in sources)
        new_array = '[\n        ' + lines + '\n    ]'
    else:
        new_array = '[]'
    new_content = re.sub(
        r'const audioSources\s*=\s*\[.*?\];',
        'const audioSources = ' + new_array + ';',
        content,
        flags=re.DOTALL
    )
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    return True


# Windows virtual key codes (تشتغل مع أي لغة كيبورد)
VK_A = 65
VK_C = 67
VK_V = 86
VK_X = 88
VK_Z = 90
VK_Y = 89


class AudioManager(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Audio Manager — options-audio.js")
        self.geometry("720x560")
        self.resizable(True, True)
        self.configure(bg="#0f0f14")
        self.js_path = tk.StringVar(value=JS_FILE)
        self.sources = []
        self._build_ui()
        self._load()
        self._bind_universal_shortcuts()

    def _build_ui(self):
        BG      = "#0f0f14"
        CARD    = "#1a1a24"
        ACCENT  = "#7c6af7"
        FG      = "#e8e6ff"
        MUTED   = "#6b6880"
        DANGER  = "#f44747"
        SUCCESS = "#4ec994"

        # Title
        title_frame = tk.Frame(self, bg=BG)
        title_frame.pack(fill="x", padx=20, pady=(18, 6))
        tk.Label(title_frame, text="Audio Manager",
                 font=("Courier New", 18, "bold"), bg=BG, fg=FG).pack(side="left")

        # File path row
        path_frame = tk.Frame(self, bg=CARD, padx=12, pady=8)
        path_frame.pack(fill="x", padx=20, pady=(0, 10))
        tk.Label(path_frame, text="JS File:", font=("Courier New", 10),
                 bg=CARD, fg=MUTED).pack(side="left")
        tk.Entry(path_frame, textvariable=self.js_path,
                 bg="#252535", fg=FG, insertbackground=FG,
                 relief="flat", font=("Courier New", 10), width=42).pack(side="left", padx=(6, 8))
        self._btn(path_frame, "Reload", self._load, ACCENT).pack(side="left")

        # Track list
        list_frame = tk.Frame(self, bg=BG)
        list_frame.pack(fill="both", expand=True, padx=20, pady=(0, 8))
        tk.Label(list_frame, text="Tracks in file",
                 font=("Courier New", 10, "bold"), bg=BG, fg=MUTED).pack(anchor="w")
        cols_frame = tk.Frame(list_frame, bg=BG)
        cols_frame.pack(fill="both", expand=True, pady=(4, 0))
        sb = tk.Scrollbar(cols_frame, bg=CARD, troughcolor=BG, relief="flat")
        sb.pack(side="right", fill="y")
        self.listbox = tk.Listbox(
            cols_frame, yscrollcommand=sb.set,
            bg=CARD, fg=FG,
            selectbackground=ACCENT, selectforeground="#fff",
            font=("Courier New", 11),
            relief="flat", bd=0, activestyle="none", highlightthickness=0,
        )
        self.listbox.pack(side="left", fill="both", expand=True)
        sb.config(command=self.listbox.yview)

        # Delete button
        del_frame = tk.Frame(self, bg=BG)
        del_frame.pack(fill="x", padx=20, pady=(0, 10))
        self._btn(del_frame, "Delete selected track", self._delete, DANGER).pack(side="left")

        # Add URLs section
        add_frame = tk.Frame(self, bg=CARD, padx=14, pady=12)
        add_frame.pack(fill="x", padx=20, pady=(0, 16))
        tk.Label(add_frame, text="Add tracks (one URL per line):",
                 font=("Courier New", 9), bg=CARD, fg=MUTED).pack(anchor="w")
        self.url_box = tk.Text(
            add_frame, height=4,
            bg="#252535", fg=FG, insertbackground=FG,
            font=("Courier New", 10), relief="flat",
            wrap="none", highlightthickness=0,
            undo=True,
        )
        self.url_box.pack(fill="x", pady=(6, 8))
        # Enter يضيف سطر جديد فقط — لا يمسح الكتابة
        self.url_box.bind("<Return>", self._on_url_box_enter)

        btn_row = tk.Frame(add_frame, bg=CARD)
        btn_row.pack(fill="x")
        self._btn(btn_row, "Add & Save", self._add, SUCCESS).pack(side="left")
        self._btn(btn_row, "🌐 myinstants.com", self._open_site, "#3a3a55").pack(side="left", padx=(10, 0))

        # Status bar
        self.status_var = tk.StringVar(value="Ready.")
        tk.Label(self, textvariable=self.status_var,
                 font=("Courier New", 9), bg=BG, fg=MUTED,
                 anchor="w").pack(fill="x", padx=22, pady=(0, 8))

    def _btn(self, parent, text, cmd, color):
        return tk.Button(
            parent, text=text, command=cmd,
            bg=color, fg="#fff", activebackground=color,
            font=("Courier New", 10, "bold"),
            relief="flat", padx=14, pady=6, cursor="hand2", bd=0
        )

    # ===== الاختصارات الشاملة (تشتغل مع أي لغة كيبورد) =====
    def _on_url_box_enter(self, event):
        self.url_box.insert(tk.INSERT, "\n")
        return "break"  # يمنع أي سلوك افتراضي

    def _bind_universal_shortcuts(self):
        # bind_all عشان يشتغل على كل الودجتس
        self.bind_all("<Control-KeyPress>", self._handle_ctrl_key)

    def _handle_ctrl_key(self, event):
        # event.keycode = الكود الفيزيائي للزر (مش مرتبط باللغة)
        widget = event.widget
        kc = event.keycode

        if kc == VK_V:   # Paste
            self._do_paste(widget)
            return "break"
        elif kc == VK_C: # Copy
            self._do_copy(widget)
            return "break"
        elif kc == VK_X: # Cut
            self._do_cut(widget)
            return "break"
        elif kc == VK_A: # Select All
            self._do_select_all(widget)
            return "break"
        elif kc == VK_Z: # Undo
            self._do_undo(widget)
            return "break"
        elif kc == VK_Y: # Redo
            self._do_redo(widget)
            return "break"

    def _get_clipboard(self):
        try:
            return self.clipboard_get()
        except tk.TclError:
            return ""

    def _do_paste(self, widget):
        text = self._get_clipboard()
        if not text:
            return
        if isinstance(widget, tk.Text):
            # تنظيف للـ url_box
            if widget is self.url_box:
                text = "\n".join(line.strip() for line in text.splitlines())
            try:
                if widget.tag_ranges("sel"):
                    widget.delete("sel.first", "sel.last")
            except tk.TclError:
                pass
            widget.insert(tk.INSERT, text)
        elif isinstance(widget, tk.Entry):
            try:
                if widget.selection_present():
                    widget.delete("sel.first", "sel.last")
            except tk.TclError:
                pass
            widget.insert(tk.INSERT, text)

    def _do_copy(self, widget):
        try:
            if isinstance(widget, tk.Text):
                text = widget.get("sel.first", "sel.last")
            elif isinstance(widget, tk.Entry):
                text = widget.selection_get()
            else:
                return
            self.clipboard_clear()
            self.clipboard_append(text)
        except tk.TclError:
            pass

    def _do_cut(self, widget):
        try:
            if isinstance(widget, tk.Text):
                text = widget.get("sel.first", "sel.last")
                self.clipboard_clear()
                self.clipboard_append(text)
                widget.delete("sel.first", "sel.last")
            elif isinstance(widget, tk.Entry):
                text = widget.selection_get()
                self.clipboard_clear()
                self.clipboard_append(text)
                widget.delete("sel.first", "sel.last")
        except tk.TclError:
            pass

    def _do_select_all(self, widget):
        if isinstance(widget, tk.Text):
            widget.tag_add("sel", "1.0", "end-1c")
        elif isinstance(widget, tk.Entry):
            widget.select_range(0, "end")
            widget.icursor("end")
        elif isinstance(widget, tk.Listbox):
            widget.select_set(0, "end")

    def _do_undo(self, widget):
        try:
            if isinstance(widget, tk.Text):
                widget.edit_undo()
        except tk.TclError:
            pass

    def _do_redo(self, widget):
        try:
            if isinstance(widget, tk.Text):
                widget.edit_redo()
        except tk.TclError:
            pass

    # ===== Logic =====
    def _open_site(self):
        import webbrowser
        webbrowser.open("https://www.myinstants.com/")

    def _load(self):
        path = self.js_path.get().strip()
        self.sources = read_sources(path)
        self._refresh_list()
        self._set_status("Loaded " + str(len(self.sources)) + " track(s) from " + path)

    def _refresh_list(self):
        self.listbox.delete(0, "end")
        for src in self.sources:
            label = src.split("/")[-1].replace(".mp3", "")
            self.listbox.insert("end", "  " + label)

    def _delete(self):
        sel = self.listbox.curselection()
        if not sel:
            messagebox.showwarning("Nothing selected", "Please select a track to delete.")
            return
        idx = sel[0]
        removed = self.sources[idx].split("/")[-1].replace(".mp3", "")
        self.sources.pop(idx)
        if write_sources(self.js_path.get().strip(), self.sources):
            self._refresh_list()
            self._set_status("Deleted: " + removed)

    def _add(self):
        raw = self.url_box.get("1.0", "end").strip()
        if not raw:
            return
        lines = [l.strip() for l in raw.splitlines() if l.strip()]
        added = []
        errors = []
        self._set_status("جاري التحقق من الروابط...")
        self.update()
        for line in lines:
            try:
                mp3 = convert_url(line)
                if mp3 in self.sources:
                    continue
                found_url, ok, reason = check_url(mp3)
                if ok:
                    if found_url not in self.sources:
                        self.sources.append(found_url)
                        added.append(found_url.split("/")[-1].replace(".mp3", ""))
                else:
                    errors.append(f"{mp3.split('/')[-1]} — {reason}")
            except ValueError as e:
                errors.append(str(e))
        if added and write_sources(self.js_path.get().strip(), self.sources):
            self._refresh_list()
            self.url_box.delete("1.0", "end")
            msg = "تمت الإضافة: " + ", ".join(added)
            self._set_status(msg)
        if errors:
            messagebox.showerror("روابط غير صالحة", "\n".join(errors))
        if not added and not errors:
            self._set_status("لا يوجد روابط جديدة للإضافة.")

    def _set_status(self, msg):
        self.status_var.set(msg)
        self.update_idletasks()


if __name__ == "__main__":
    app = AudioManager()
    app.mainloop()