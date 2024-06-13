// Importa os módulos necessários 
// não altere! 
const serialport = require('serialport');
const express = require('express');
const mysql = require('mysql2');

// Constantes para configurações 
// não altere! 
const SERIAL_BAUD_RATE = 9600;
const SERVIDOR_PORTA = 3300;

// VARIAVEL DO IDSENSOR QUE SEMPRE VAI SER 1 
const idsensor = 1;

// VARIAVEL QUE CONTA OS SEGUNDOS 
var segundo = 0;
// VARIAVEL QUE DEFINE O TEMPO ENTRE OS INSERTS (EM SEGUNDOS) 
var tempo_insert = 5;
// VARIAVEL QUE EXIBE O TEMPO RESTANTE 
var tempo_restante = tempo_insert;

// Função para controlar o tempo dos inserts 
function segundo2() {
    segundo++;
    tempo_restante--;
    if (segundo >= tempo_insert) {
        // Habilita o INSERT no banco
        HABILITAR_OPERACAO_INSERIR = 1;
        segundo = 0;
        console.log('Realizei o insert no banco!');
        tempo_restante = tempo_insert;
    } else {
        // Desabilita o INSERT no banco
        HABILITAR_OPERACAO_INSERIR = 0;
        console.log('Segundos até o INSERT:', tempo_restante);
        console.log(' ');
        console.log('Quantas vezes a porta foi aberta:', qtd_abertura);
        console.log(' ');
    }
}
setInterval(segundo2, 1000);

// Função para comunicação serial 
const serial = async (valoresLm35Temperatura, valoresChave) => {
    // Conexão com o banco de dados MySQL 
    let poolBancoDados = mysql.createPool({
        host: '10.18.36.200',
        user: 'aluno',
        password: 'Sptech#2024',
        database: 'bd_coldtrack',
        port: 3307
    }).promise();

    // Lista as portas seriais disponíveis e procura pelo Arduino 
    const portas = await serialport.SerialPort.list();
    const portaArduino = portas.find((porta) => porta.vendorId == 2341 && porta.productId == 43);
    if (!portaArduino) {
        throw new Error('O arduino não foi encontrado em nenhuma porta serial');
    }

    // Configura a porta serial com o baud rate especificado 
    const arduino = new serialport.SerialPort({
        path: portaArduino.path,
        baudRate: SERIAL_BAUD_RATE
    });

    // Evento quando a porta serial é aberta 
    arduino.on('open', () => {
        console.log(`A leitura do arduino foi iniciada na porta ${portaArduino.path} utilizando Baud Rate de ${SERIAL_BAUD_RATE}`);
    });

    // Processa os dados recebidos do Arduino 
    arduino.pipe(new serialport.ReadlineParser({ delimiter: '\r\n' })).on('data', async (data) => {
        const valores = data.split(';');
        const lm35Temperatura = Number((Math.random() * 6 - 3).toFixed(2));
        const chave = parseInt(valores[1]);

        console.log(lm35Temperatura);
        // Variável para armazenar as consultas SQL 
        let v = [
            // Consulta para inserir dados de abertura
            `INSERT INTO DadosAbertura (idDadoAbertura, Aberturas, fksensorbloqueio, fkporta, fkrefrigerador, fkestabelecimento, fkCliente) VALUES (?,${qtd_abertura},${idsensor},${1},${1},${1},${1})`,
            // Consulta para inserir dados de temperatura
            `INSERT INTO dadosTemperatura (idDadoTemperatura, Temperatura, fkSensorTemperatura, fkRefrigerador, fkEstabelecimento, fkCliente) VALUES (?,${lm35Temperatura},${1},${1},${1},${1})`
        ];

        // Armazena os valores dos sensores nos arrays correspondentes 
        valoresLm35Temperatura.push(lm35Temperatura);
        valoresChave.push(chave);

        // Insere os dados no banco de dados (se habilitado) 
        if (HABILITAR_OPERACAO_INSERIR == 1) {
            // Verificação da duplicidade da chave primária
            // 1. Consulta no banco de dados para verificar se o idDadoAbertura já existe
            const [rows] = await poolBancoDados.execute(v[0], [idmetrica]);
            // 2. Se não encontrar registros, insere os dados
            if (rows.length === 0) {
                // Insere dados da abertura 
                await poolBancoDados.execute(v[0], [idmetrica]);
            }
            // 3. Insere dados da temperatura 
            await poolBancoDados.execute(v[1], [idmetrica]);

            // Aumenta o id da métrica em um 
            idmetrica++;

            // Reseta a variável que exibe a quantidade de aberturas 
            qtd_abertura = 0;
        }

        console.log('Temperatura interna do refrigerador:', lm35Temperatura);
        console.log(' ');
        console.log(' ');

        // LÓGICA QUE FAZ A SOMA DA ABERTURA DAS PORTAS 
        if (chave == 1 && controle) {
            // Se a chave é 1 e a variável de controle é TRUE, eu abri a porta e vou somar na qtd_abertura 
            qtd_abertura += chave;
            // Eu defino a variável de controle como FALSE ate eu fechar a porta 
            controle = false;
        }
        // Se a chave é 0, a porta esta fechada e eu posso inserir de novo, logo a variável de controle vira TRUE 
        if (chave == 0 && !controle) {
            controle = true;
        }
    });

    // Evento para lidar com erros na comunicação serial 
    arduino.on('error', (mensagem) => {
        console.error(`Erro no arduino (Mensagem: ${mensagem}`);
    });
};

// não altere! 
// Função para criar e configurar o servidor web 
const servidor = (valoresLm35Temperatura, valoresChave) => {
    const app = express();
    // Configurações de CORS 
    app.use((request, response, next) => {
        response.header('Access-Control-Allow-Origin', '*');
        response.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
        next();
    });
    // Inicia o servidor na porta especificada 
    app.listen(SERVIDOR_PORTA, () => {
        console.log(`API executada com sucesso na porta ${SERVIDOR_PORTA}`);
    });
    // Define os endpoints da API para cada tipo de sensor 
    app.get('/sensores/lm35/temperatura', (_, response) => {
        return response.json(valoresLm35Temperatura);
    });
    app.get('/sensores/chave', (_, response) => {
        return response.json(valoresChave);
    });
};

// Função principal assíncrona para iniciar a comunicação serial e o servidor web 
(async () => {
    // Arrays para armazenar os valores dos sensores 
    const valoresLm35Temperatura = [];
    const valoresChave = [];
    // Inicia a comunicação serial 
    await serial(valoresLm35Temperatura, valoresChave);
    // Inicia o servidor web 
    servidor(valoresLm35Temperatura, valoresChave);
})();