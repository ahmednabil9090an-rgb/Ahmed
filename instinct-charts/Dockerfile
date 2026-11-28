# نسخة الويب لا تحتاج أي حزم خارجية إطلاقًا، فالصورة صغيرة جدًا
# ولا يوجد فيها خطوة تثبيت. حزم Capacitor الموجودة في package.json
# تخص تطبيق الهاتف فقط ولا لزوم لها هنا.

FROM node:20-alpine

WORKDIR /app

COPY server.js ./
COPY www ./www

ENV PORT=8080
EXPOSE 8080

# فحص صحة بسيط يستخدمه مزوّد الاستضافة لمعرفة أن الخدمة تعمل
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
