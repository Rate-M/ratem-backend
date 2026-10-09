const { text } = require('express');
const nodemailer = require('nodemailer');

let transporter;

async function getTransporter() {
    if (!transporter) {
        const testAcount = await nodemailer.createTestAccount();

        transporter = nodemailer.createTransport({
            host: testAcount.smtp.host,
            port: testAcount.smtp.port,
            secure: testAcount.smtp.secure,
            auth: {
                user: testAcount.user,
                pass: testAcount.pass,
            },
        });
    }

    return transporter;

}

async function sendVerificationEmail(email, token ) {
    const mailer = await getTransporter();

    const link =  
    `http://localhost:${process.env.PORT || 3000}` +
    `/api/auth/verify-email?token=${encodeURIComponent(token)}`;

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

module.exports = { getTransporter, sendVerificationEmail };     