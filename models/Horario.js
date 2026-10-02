const mongoose = require('mongoose');

// Configuração semanal recorrente: ex. "Terça-feira 08:00 -> capacidade 2"
const horarioSchema = new mongoose.Schema({
    diaSemana: { type: String, required: true },
    horario: { type: String, required: true },
    capacidadeTotal: { type: Number, required: true, min: 0 }
});

// Não permite dois documentos para o mesmo dia/horário
horarioSchema.index({ diaSemana: 1, horario: 1 }, { unique: true });

module.exports = mongoose.model('Horario', horarioSchema);
