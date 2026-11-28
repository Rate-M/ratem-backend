const nodemailer = require('nodemailer');

let transporter;

async function getTransporter() {
    if (!transporter) {
        const testAccount = await nodemailer.createTestAccount();

        transporter = nodemailer.createTransport({
            host: testAccount.smtp.host,
            port: testAccount.smtp.port,
            secure: testAccount.smtp.secure,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });
    }

    return transporter;

}

async function sendVerificationEmail(email, token ) {
    const mailer = await getTransporter();

    const link = process.env.CLIENT_URL
        ? new URL(`/confirmar-correo/${encodeURIComponent(token)}`, process.env.CLIENT_URL).href
        : `http://localhost:${process.env.PORT || 3000}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

    const info = await mailer.sendMail({
        from: '"RateM" <no-reply@ratem.com>',
        to: email,
        subject: 'Confirma tu correo en RateM',
        text: `Por favor, haz clic en el siguiente enlace para verificar tu correo electrónico: ${link}`,
        html: `
        <h1>Bienvenido a RateM</h1>
        <p>Confirma tu correo haciendo clic en el enlace:</p>
        <a href="${link}">Confirmar mi correo</a>
        <p>El enlace vence en 24 horas.</p>
        `,
    });

    console.log(
        'abre tu correo de prueba',
        nodemailer.getTestMessageUrl(info)
    )
}

async function sendPasswordResetEmail(email, token) {
    const base = process.env.CLIENT_URL || 'http://localhost:5173';
    const link = new URL('/cambiar-contrasena/' + encodeURIComponent(token), base).href;
    const mailer = await getTransporter();
    const info = await mailer.sendMail({
        from: '"RateM" <no-reply@ratem.com>',
        to: email,
        subject: 'Restablece tu contraseña en RateM',
        text: 'Restablece tu contraseña con este enlace, válido por una hora: ' + link +
            '\nSi no solicitaste el cambio, puedes ignorar este correo.',
    });
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) console.log('Correo de recuperación de prueba:', preview);
}

module.exports = { getTransporter, sendVerificationEmail, sendPasswordResetEmail };
