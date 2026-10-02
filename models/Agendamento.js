const mongoose = require('mongoose');

const agendamentoSchema = new mongoose.Schema({
    dataAtendimento: { type: String, required: true }, // formato AAAA-MM-DD
    horario: { type: String, required: true },         // formato HH:MM
    cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', required: true },
    clienteNome: String,
    clienteCPF: String
});

module.exports = mongoose.model('Agendamento', agendamentoSchema);
