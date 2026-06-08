import os
import subprocess
import tkinter as tk
from tkinter import messagebox, ttk

# تحديد مسار المجلد الحالي للسكربت كبيئة عمل أساسية لـ Git
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

# دالة لتشغيل أوامر جيت مع عرض تفصيلي فوري لكل خطوة ومخرجاتها
def run_git_cmd_verbose(steps, success_msg):
    """
    تأخذ هذه الدالة مصفوفة من الخطوات، كل خطوة تحتوي على الأمر البرمجي ورسالة وصفية لعرضها للمستخدم.
    تقوم بتحديث الكونسول فوراً بكل ملف تمت إضافته أو تعديله وبحجم الرفع والملفات المتأثرة.
    """
    output_text.delete("1.0", tk.END)
    output_text.insert(tk.END, "🔄 بدء تنفيذ العمليات...\n" + "─" * 50 + "\n")
    root.update()
    
    overall_success = True
    full_output = ""
    
    for cmd, desc in steps:
        output_text.insert(tk.END, f"🏃 {desc}...\n")
        output_text.see(tk.END)
        root.update()
        
        try:
            # تشغيل العملية وجلب المخرجات العادية والأخطاء معاً لمعرفة التفاصيل كاملة
            result = subprocess.run(
                cmd, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE, 
                text=True, 
                check=True, 
                cwd=SCRIPT_DIR
            )
            
            # طباعة التفاصيل في الكونسول
            if result.stdout:
                output_text.insert(tk.END, result.stdout + "\n")
            if result.stderr:
                # بعض أوامر جيت (مثل الرفع) تطبع تقاريرها التقدمية في قنوات الخطأ القياسي stderr بشكل طبيعي
                output_text.insert(tk.END, result.stderr + "\n")
                
            output_text.insert(tk.END, "✔️ خطوة ناجحة!\n" + "─" * 30 + "\n")
            output_text.see(tk.END)
            root.update()
            
        except subprocess.CalledProcessError as e:
            overall_success = False
            output_text.insert(tk.END, f"❌ فشلت الخطوة!\n" + "─" * 15 + " تفاصيل الخطأ " + "─" * 15 + f"\n{e.stderr}\n")
            if e.stdout:
                output_text.insert(tk.END, f"{e.stdout}\n")
            output_text.see(tk.END)
            root.update()
            break  # التوقف فوراً عند حدوث أي خطأ لمنع تداخل العمليات
            
    if overall_success:
        output_text.insert(tk.END, f"\n🎉 {success_msg}\n")
        output_text.see(tk.END)
        messagebox.showinfo("نجاح العملية", success_msg)
    else:
        messagebox.showerror("خطأ في تنفيذ العمليات", "توقفت العملية بسبب خطأ تقني. يرجى مراجعة تفاصيل الكونسول في الأسفل.")

# 1. دالة الرفع التفصيلية (Verbose Push Changes)
def execute_push():
    commit_msg = commit_entry.get().strip()
    if not commit_msg:
        messagebox.showwarning("تنبيه هام", "الرجاء كتابة وصف التعديل (Commit Message) لتوضيح ما قمت بتعديله أو إصلاحه أولاً!")
        return
    
    # تحضير خطوات جيت المتسلسلة لجمع المخرجات التفصيلية
    steps = [
        # أولاً: إضافة التعديلات ورصد الملفات الجديدة أو المعدلة
        (['git', 'add', '-v', '.'], "رصد وإضافة الملفات المحدثة والمجلدات (git add)"),
        # ثانياً: تسجيل التغييرات وعرض ما حدث (الأعداد والإدراج والحذف)
        (['git', 'commit', '-m', commit_msg], "تثبيت التعديلات الحالية محلياً (git commit)"),
        # ثالثاً: إرسال الحزم مع تفعيل خيار التقرير التفصيلي لمعرفة كم ميجا بايت تم رفعها
        (['git', 'push', '-v'], "تصدير ورفع الملفات إلى مستودع GitHub البعيد (git push)")
    ]
    
    execute_push_btn.config(state=tk.DISABLED)
    execute_pull_btn.config(state=tk.DISABLED)
    
    run_git_cmd_verbose(steps, "تم رصد التعديلات، إضافتها، وحفظ التثبيت، ثم رفعها إلى GitHub بنجاح كامل!")
    
    # تفريغ مربع النص بعد الرفع الناجح
    commit_entry.delete(0, tk.END)
    execute_push_btn.config(state=tk.NORMAL)
    execute_pull_btn.config(state=tk.NORMAL)

# 2. دالة السحب والتحديث التفصيلية (Verbose Pull Changes)
def execute_pull():
    steps = [
        # جلب التعديلات مع تفاصيل الفروقات (Verbose + Stat) لمعرفة أي ملفات تغيرت أو تم تعديلها على الموقع
        (['git', 'pull', '--verbose', '--stat', 'origin', 'main'], "جلب التحديثات الجديدة ومزامنة المجلد (git pull)")
    ]
    
    execute_push_btn.config(state=tk.DISABLED)
    execute_pull_btn.config(state=tk.DISABLED)
    
    run_git_cmd_verbose(steps, "تمت مزامنة مجلدك المحلي وجلب كافة الملفات الجديدة والمعدلة من GitHub بنجاح!")
    
    execute_push_btn.config(state=tk.NORMAL)
    execute_pull_btn.config(state=tk.NORMAL)

# بناء وتصميم الواجهة الرسومية الأنيقة والمتكاملة
root = tk.Tk()
root.title("Anasqbit - Git Premium Assistant Console")
root.geometry("620x580") # تم إزالة السطر التالف والإبقاء على التنسيق السليم لحجم النافذة
root.configure(bg="#121212") # لون غامق عصري ومريح للعين

# تحسين مظهر الأزرار والإطارات
style = ttk.Style()
style.theme_use('clam')

# ترويسة البرنامج والعنوان الرئيسي
title_label = tk.Label(
    root, 
    text="مساعد كونسول جيت الذكي | يوتيوب بريميوم بلس", 
    bg="#121212", 
    fg="#00ffcc", 
    font=("Segoe UI", 14, "bold")
)
title_label.pack(pady=15)

# ─── إطار عمليات الرفع (Push Panel) ───
push_frame = tk.LabelFrame(
    root, 
    text=" 🚀 تصدير ورفع الكود إلى GitHub ", 
    bg="#1e1e1e", 
    fg="#00ffcc", 
    font=("Segoe UI", 10, "bold"), 
    padx=15, 
    pady=10,
    bd=1,
    relief="solid"
)
push_frame.pack(fill="x", padx=20, pady=8)

entry_label = tk.Label(
    push_frame, 
    text="اكتب التحديثات التي أجريتها (ماذا أضفت أو عدلت؟):", 
    bg="#1e1e1e", 
    fg="#aaaaaa",
    font=("Segoe UI", 9)
)
entry_label.pack(anchor="w", pady=2)

commit_entry = tk.Entry(
    push_frame, 
    font=("Consolas", 10), 
    bg="#2d2d2d", 
    fg="#ffffff", 
    insertbackground="white",
    bd=1,
    relief="solid"
)
commit_entry.pack(fill="x", pady=6, ipady=4)

execute_push_btn = tk.Button(
    push_frame, 
    text="بدء عملية الرفع الشاملة (Add + Commit + Push)", 
    bg="#28a745", 
    fg="white", 
    font=("Segoe UI", 10, "bold"), 
    command=execute_push, 
    cursor="hand2",
    bd=0,
    activebackground="#218838",
    activeforeground="white"
)
execute_push_btn.pack(fill="x", pady=5, ipady=5)

# ─── إطار عمليات السحب (Pull Panel) ───
pull_frame = tk.LabelFrame(
    root, 
    text=" 📥 استيراد وتحديث المجلد المحلي ", 
    bg="#1e1e1e", 
    fg="#007bff", 
    font=("Segoe UI", 10, "bold"), 
    padx=15, 
    pady=10,
    bd=1,
    relief="solid"
)
pull_frame.pack(fill="x", padx=20, pady=8)

execute_pull_btn = tk.Button(
    pull_frame, 
    text="جلب التحديثات من السحاب والدمج (Git Pull)", 
    bg="#007bff", 
    fg="white", 
    font=("Segoe UI", 10, "bold"), 
    command=execute_pull, 
    cursor="hand2",
    bd=0,
    activebackground="#0069d9",
    activeforeground="white"
)
execute_pull_btn.pack(fill="x", pady=2, ipady=5)

# ─── كونسول مخرجات العملية ومراقبة البيانات (Terminal Console Output) ───
console_frame = tk.Frame(root, bg="#121212")
console_frame.pack(fill="both", expand=True, padx=20, pady=(10, 15))

output_label = tk.Label(
    console_frame, 
    text="🖥️ كونسول تفاصيل عمليات جيت النشطة (Terminal Logs):", 
    bg="#121212", 
    fg="#ffffff",
    font=("Segoe UI", 9, "bold")
)
output_label.pack(anchor="w", pady=(0, 4))

# إضافة شريط تمرير (Scrollbar) تفاعلي للكونسول لتسهيل قراءة التقارير الطويلة
scrollbar = tk.Scrollbar(console_frame)
scrollbar.pack(side="right", fill="y")

output_text = tk.Text(
    console_frame, 
    bg="#000000", 
    fg="#39ff14", # اللون الأخضر الفسفوري الخاص بشاشات المطورين والهاكرز
    font=("Consolas", 10), 
    bd=1, 
    relief="solid",
    yscrollcommand=scrollbar.set,
    insertbackground="white"
)
output_text.pack(fill="both", expand=True)
scrollbar.config(command=output_text.yview)

output_text.insert(tk.END, "💻 الكونسول جاهز ومستعد لمراقبة العمليات...\n" + "─" * 50 + "\n")

root.mainloop()