import os
import subprocess
import tkinter as tk
from tkinter import messagebox, ttk

# إصلاح ذكي: تحديد مسار المجلد الحالي للسكربت كبيئة عمل أساسية لـ Git
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

# دالة لتشغيل أوامر Git وعرض النتيجة
def run_git_cmd(cmd, success_msg):
    try:
        result = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True
        )
        output_text.delete("1.0", tk.END)
        output_text.insert(tk.END, result.stdout if result.stdout else "العملية تمت بنجاح!")
        messagebox.showinfo("نجاح", success_msg)
    except subprocess.CalledProcessError as e:
        output_text.delete("1.0", tk.END)
        output_text.insert(tk.END, f"خطأ:\n{e.stderr}")
        messagebox.showerror("خطأ في Git", "فشلت العملية، راجع تفاصيل الخطأ في الأسفل.")

# 1. دالة الرفع (Push Changes)
def execute_push():
    commit_msg = commit_entry.get().strip()
    if not commit_msg:
        messagebox.showwarning("تنبيه", "الرجاء كتابة وصف التعديل (Commit Message) أولاً!")
        return
    
    output_text.delete("1.0", tk.END)
    output_text.insert(tk.END, "جاري رفع الملفات...\n")
    root.update()
    
    try:
        # التأكد من بقاء بيئة العمل داخل المجلد الصحيح
        subprocess.run(['git', 'add', '.'], check=True, cwd=SCRIPT_DIR)
        subprocess.run(['git', 'commit', '-m', commit_msg], check=True, cwd=SCRIPT_DIR)
        result = subprocess.run(['git', 'push'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True, cwd=SCRIPT_DIR)
        
        output_text.insert(tk.END, result.stdout + "\n✅ تم الرفع إلى GitHub بنجاح!")
        commit_entry.delete(0, tk.END)
        messagebox.showinfo("نجاح", "تمت إضافة وتثبيت ورفع الملفات بنجاح!")
    except subprocess.CalledProcessError as e:
        output_text.insert(tk.END, f"\nحدث خطأ أثناء الرفع:\n{e.stderr}")
        messagebox.showerror("خطأ", "لم يتم الرفع، تأكد من حالة المستودع ومن وجود ملف .git في المجلد.")

# 2. دالة السحب والتحديث (Pull Changes)
def execute_pull():
    output_text.delete("1.0", tk.END)
    output_text.insert(tk.END, "جاري فحص وجلب التحديثات من GitHub...\n")
    root.update()
    
    run_git_cmd(['git', 'pull', 'origin', 'main'], "تم تحديث مجلدك المحلي بملفات GitHub الجديدة!")

# بناء الواجهة الرسومية
root = tk.Tk()
root.title("Anasqbit - Git Assistant GUI")
root.geometry("550x500")
root.configure(bg="#1e1e1e")

style = ttk.Style()
style.theme_use('clam')

# العنوان
title_label = tk.Label(root, text="مساعد GitHub الذكي لإضافة يوتيوب بريميوم", bg="#1e1e1e", fg="#00ffcc", font=("Helvetica", 14, "bold"))
title_label.pack(pady=15)

# إطار الرفع (Push Section)
push_frame = tk.LabelFrame(root, text=" رفع تعديلات جديدة إلى GitHub ", bg="#1e1e1e", fg="#ffffff", font=("Helvetica", 10, "bold"), padx=10, pady=10)
push_frame.pack(fill="x", padx=20, pady=10)

entry_label = tk.Label(push_frame, text="اكتب ما الذي قمت بتعديله أو إصلاحه:", bg="#1e1e1e", fg="#cccccc")
entry_label.pack(anchor="w", pady=2)

commit_entry = tk.Entry(push_frame, width=60, font=("Helvetica", 10), bg="#2d2d2d", fg="#ffffff", insertbackground="white")
commit_entry.pack(fill="x", pady=5)

push_btn = tk.Button(push_frame, text="🚀 تنفيذ الرفع (Add + Commit + Push)", bg="#28a745", fg="white", font=("Helvetica", 10, "bold"), command=execute_push, cursor="hand2")
push_btn.pack(fill="x", pady=5)

# إطار السحب (Pull Section)
pull_frame = tk.LabelFrame(root, text=" جلب التحديثات من GitHub إلى جهازك ", bg="#1e1e1e", fg="#ffffff", font=("Helvetica", 10, "bold"), padx=10, pady=10)
pull_frame.pack(fill="x", padx=20, pady=5)

pull_btn = tk.Button(pull_frame, text="📥 تحديث المجلد المحلي (Git Pull)", bg="#007bff", fg="white", font=("Helvetica", 10, "bold"), command=execute_pull, cursor="hand2")
pull_btn.pack(fill="x", pady=5)

# شاشة عرض النتائج والمخرجات (Terminal Output)
output_label = tk.Label(root, text="مخرجات العملية (Logs):", bg="#1e1e1e", fg="#ffffff")
output_label.pack(anchor="w", padx=20, pady=(10, 2))

output_text = tk.Text(root, height=8, bg="#000000", fg="#00ff00", font=("Consolas", 9), borderwidth=2, relief="groove")
output_text.pack(fill="both", expand=True, padx=20)
output_text.insert(tk.END, "جاهز لتنفيذ العمليات...\n")

root.mainloop()