const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    cpf: { type: String, required: true, unique: true }
});

module.exports = mongoose.model('Cliente', clienteSchema);
