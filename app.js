require('dotenv').config();
const express = require('express');
const { engine } = require('express-handlebars');
const mongoose = require('mongoose');
const path = require('path');

const Horario = require('./models/Horario');
const Agendamento = require('./models/Agendamento');
const Cliente = require('./models/Cliente');

const app = express();

// Handlebars
app.engine('handlebars', engine({
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts')
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Middlewares // Roda entre Req E Res, para processar dados antes de chegar na rota
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); // Le dado de Form HTML e transforma em objeto JS
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Conectado ao MongoDB, banco de dados:', mongoose.connection.name))
    .catch(err => console.error('Erro ao conectar ao MongoDB', err));

// ---------- Utilitários ----------
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

// Data local no formato AAAA-MM-DD (evita o deslocamento de fuso do toISOString)
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// AAAA-MM-DD -> DD/MM/AAAA
const dataBR = s => s.split('-').reverse().join('/');

// AAAA-MM-DD -> nome do dia da semana
const diaDaSemana = s => {
    const [a, m, d] = s.split('-').map(Number);
    return DIAS[new Date(a, m - 1, d).getDay()];
};

const mensagem = (res, status, texto) =>
    res.status(status).render('resultado', { mensagem: texto, sucesso: status < 400, title: 'Resultado' });

// ROTAS DO CLIENTE

// Calendário semanal: próximos 7 dias, só slots futuros e com vaga
app.get('/', async (req, res) => {
    const configs = await Horario.find({ capacidadeTotal: { $gt: 0 } }).sort({ horario: 1 }).lean();
    const agora = new Date();
    const dias = [];

    
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(agora.getDate() + i);
        const data = fmt(d);
        const nomeDia = DIAS[d.getDay()];
        const slots = [];

        for (const c of configs.filter(c => c.diaSemana === nomeDia)) {
            // omite horários que já passaram
            if (new Date(`${data}T${c.horario}:00`) <= agora) continue;
            // conta quantos agendamentos já existem para este slot
            const ocupados = await Agendamento.countDocuments({ dataAtendimento: data, horario: c.horario });
            const vagas = c.capacidadeTotal - ocupados;
            if (vagas > 0) {
                slots.push({ valor: `${data}|${c.horario}`, horario: c.horario, vagas });
            }
        }

        if (slots.length) dias.push({ nome: nomeDia, data: dataBR(data), slots });
    }

    res.render('home', { dias, title: 'Agendamento Pet Shop' });
});

// Processar o agendamento
app.post('/agendar', async (req, res) => {
    const { slot, cpf } = req.body;
    const nome = (req.body.nome || '').trim();
    const [dataAtendimento, horario] = (slot || '').split('|');
    
    if (!dataAtendimento || !horario || !nome || !/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(cpf || '')) {
        return mensagem(res, 400, 'Dados inválidos. Verifique o horário, o nome e o CPF (000.000.000-00).');
    }

    try {
        // 1. Verifica se o horário existe, tem capacidade e ainda não passou
        const config = await Horario.findOne({ diaSemana: diaDaSemana(dataAtendimento), horario });
        if (!config || config.capacidadeTotal <= 0 ||
            new Date(`${dataAtendimento}T${horario}:00`) <= new Date()) {
            return mensagem(res, 400, 'Horário inválido ou indisponível.');
        }

        const ocupadosAntes = await Agendamento.countDocuments({ dataAtendimento, horario });
        if (ocupadosAntes >= config.capacidadeTotal) {
            return mensagem(res, 409, 'Este horário não possui mais vagas.');
        }

        // 2. Cadastra ou identifica o cliente
        const cliente = await Cliente.findOneAndUpdate(
            { cpf },
            { $setOnInsert: { nome } },
            { upsert: true, new: true }
        );

        // 3. Registra o agendamento associado ao cliente
        const ag = await Agendamento.create({
            dataAtendimento,
            horario,
            cliente: cliente._id,
            clienteNome: cliente.nome,
            clienteCPF: cliente.cpf
        });

        // 4. Reconfere após gravar: se duas requisições disputaram a última vaga, desfaz
        const ocupados = await Agendamento.countDocuments({ dataAtendimento, horario });
        if (ocupados > config.capacidadeTotal) {
            await ag.deleteOne();
            return mensagem(res, 409, 'Este horário acabou de ser preenchido por outro cliente.');
        }

        // 5. Informa sucesso
        mensagem(res, 200, `Agendamento realizado com sucesso para ${dataBR(dataAtendimento)} às ${horario}!`);
    } catch (error) {
        console.error(error);
        mensagem(res, 500, 'Erro ao processar agendamento.');
    }
});

// ROTAS DE ADMINISTRAÇÃO

// Formulário de ajuste da agenda
app.get('/ajustaPetAgenda', async (req, res) => {
    const horarios = await Horario.find().lean();
    horarios.sort((a, b) => DIAS.indexOf(a.diaSemana) - DIAS.indexOf(b.diaSemana) || a.horario.localeCompare(b.horario));
    res.render('ajustaPetAgenda', { horarios, title: 'Configurar Agenda' });
});

// Ajusta a capacidade de um slot (ou cria se não existir)
app.post('/ajustaPetAgenda', async (req, res) => {
    const { diaSemana, horario } = req.body;
    const capacidade = parseInt(req.body.capacidade, 10);

    if (!DIAS.includes(diaSemana) || !horario || Number.isNaN(capacidade) || capacidade < 0) {
        return mensagem(res, 400, 'Dados de configuração inválidos.');
    }

    // upsert: cria o slot ou altera a capacidade se ele já existir
    await Horario.findOneAndUpdate(
        { diaSemana, horario },
        { capacidadeTotal: capacidade },
        { upsert: true }
    );
    res.redirect('/ajustaPetAgenda');
});

// Lista de agendamentos (para conferência)
app.get('/listaPetAgenda', async (req, res) => {
    const lista = await Agendamento.find().sort({ dataAtendimento: 1, horario: 1 }).lean();
    const agendamentos = lista.map(a => ({ ...a, dataAtendimento: dataBR(a.dataAtendimento) }));
    res.render('listaPetAgenda', { agendamentos, title: 'Visualização da Agenda' });
});

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
