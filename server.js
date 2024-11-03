const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const cheerio = require('cheerio');
const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb+srv://pellibrsp:Nb3DY4jf7oc86Cau@serverlessinstance0.zro0ls4.mongodb.net/?retryWrites=true&w=majority&appName=ServerlessInstance0');

// MongoDB schema for storing WhatsApp numbers
const NumberSchema = new mongoose.Schema({
    number: String
});
const Number = mongoose.model('Number', NumberSchema);

// WhatsApp client setup
const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp client is ready!');
});

client.initialize();

// Function to get Mega-Sena results
async function getConteudoResultado() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537');
    await page.setJavaScriptEnabled(true);
    await page.goto('https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx', {waitUntil: 'networkidle0'});

    const htmlContent = await page.content();
    const $ = cheerio.load(htmlContent);
    const spanText = $('h2 span.ng-binding').text();
    const regexData = /\d{2}\/\d{2}\/\d{4}/;
    const imprimiDate = spanText.match(regexData);

    const regexConcurso = /Concurso \d+/g;
    const imprimiConcurso = spanText.match(regexConcurso)

    const numbers = $('.numbers li').map((i, el) => {
        return $(el).text();
    }).get();

    console.log(spanText);
    console.log(numbers);

    let html = fs.readFileSync('mega.html', 'utf8');
    const $html = cheerio.load(html);
    $html('#concurso').text(imprimiConcurso);
    $html('#dataConcurso').text(imprimiDate);
    const $listaNumeros = $html('#lista-numeros');
    $listaNumeros.empty();
    numbers.forEach(numero => {
        $listaNumeros.append(`<li class="circle zSMazd UHlKbe">${numero}</li>`);
    });

    fs.writeFileSync('mega.html', $html.html());

    await browser.close();
}

// Function to convert HTML to image
async function convertHtmlToImage(htmlFilePath, outputPath) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto(`file://${htmlFilePath}`, { waitUntil: 'networkidle0' });

    await page.setViewport({ width: 1080, height: 1080 });

    await page.screenshot({ path: outputPath, fullPage: true });

    await browser.close();
}

// Function to send WhatsApp message
async function sendWhatsAppMessage(number, imagePath) {
    const chat = await client.getChatById(number);
    await chat.sendMessage(await client.sendMessage(number, {
        caption: 'Mega-Sena Results',
        file: imagePath
    }));
}

// Cron job to run daily
cron.schedule('0 0 * * *', async () => {
    try {
        await getConteudoResultado();
        const htmlFilePath = path.join(__dirname, 'mega.html');
        const outputImagePath = path.join(__dirname, 'output1.png');
        await convertHtmlToImage(htmlFilePath, outputImagePath);

        const numbers = await Number.find();
        for (const numberDoc of numbers) {
            await sendWhatsAppMessage(numberDoc.number, outputImagePath);
        }
    } catch (error) {
        console.error('Error in cron job:', error);
    }
});

// API Endpoints

// Endpoint to check the API status
app.get('/getStatus', async (req, res) => {
    try {
        const estado = await client.getState();
        res.status(200).json({ Sucesso: true, estado });
    } catch (error) {
        res.status(500).json({ Sucesso: false, error: error.message });
    }
});

// Endpoint to add a new WhatsApp number
app.post('/addNumber', async (req, res) => {
    try {
        const { number } = req.body;
        const newNumber = new Number({ number });
        await newNumber.save();
        res.status(201).json({ message: 'Number added successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to manually trigger the process
app.post('/triggerProcess', async (req, res) => {
    try {
        await getConteudoResultado();
        const htmlFilePath = path.join(__dirname, 'mega.html');
        const outputImagePath = path.join(__dirname, 'output1.png');
        await convertHtmlToImage(htmlFilePath, outputImagePath);

        const numbers = await Number.find();
        for (const numberDoc of numbers) {
            await sendWhatsAppMessage(numberDoc.number, outputImagePath);
        }

        res.status(200).json({ message: 'Process completed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});