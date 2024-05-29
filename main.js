// Importa os módulos necessários
// não altere!
const serialport = require('serialport'); // Módulo para comunicação serial
const express = require('express'); // Módulo para criar um servidor web
const mysql = require('mysql2'); // Módulo para conectar ao MySQL

// Constantes para configurações
// não altere!
const SERIAL_BAUD_RATE = 9600;
const SERVIDOR_PORTA = 3300;

// VARIAVEL DO IDSENSOR QUE SEMPRE VAI SER 1
const idsensor = 1
// VARIAVEL DO ID DO MEU INSERT (OU DOS MEUS DADOS)
let idmetrica = 1

// variavel da quantidade de aberturas
let qtd_abertura = 0;
//variavel que faz a lógica da contagem de aberturas
let controle = false;

// variavel que permite o INSERT no banco
let HABILITAR_OPERACAO_INSERIR = 0;

//VARIAVEL QUE CONTA OS SEGUNDOS
var segundo = 0
//VARIAVEL QUE DEFINE O TEMPO ENTRE OS INSERTS (EM SEGUNDOS)
var tempo_insert = 15

//VARIAVEL QUE EXIBE O TEMPO RESTANTE
var tempo_restante = tempo_insert


        
function segundo2() {
    segundo ++
    tempo_restante--
    if (segundo >= tempo_insert){
        HABILITAR_OPERACAO_INSERIR = 1
        segundo = 0
        console.log('Realizei o insert no banco!')
    tempo_restante = tempo_insert

    } else {
        HABILITAR_OPERACAO_INSERIR = 0
        console.log('Segundos até o INSERT:', tempo_restante)
        console.log(' ')

        console.log('Quantas vezes a porta foi aberta:', qtd_abertura)
        console.log(' ')


    }
}
setInterval(segundo2, 1000);

// Função para comunicação serial
const serial = async (
    valoresLm35Temperatura,
    valoresChave
) => {
    let poolBancoDados = ''

    // Conexão com o banco de dados MySQL
    poolBancoDados = mysql.createPool(
        {
            host: 'localhost', 
            user: 'root',
            password: '281004',
            database: 'bd_coldtrack',
            port: 3306
        }
    ).promise();

    // Lista as portas seriais disponíveis e procura pelo Arduino
    const portas = await serialport.SerialPort.list();
    const portaArduino = portas.find((porta) => porta.vendorId == 2341 && porta.productId == 43);
    if (!portaArduino) {
        throw new Error('O arduino não foi encontrado em nenhuma porta serial');
    }

    // Configura a porta serial com o baud rate especificado
    const arduino = new serialport.SerialPort(
        {
            path: portaArduino.path,
            baudRate: SERIAL_BAUD_RATE
        }
    );

    // Evento quando a porta serial é aberta
    arduino.on('open', () => {
        console.log(`A leitura do arduino foi iniciada na porta ${portaArduino.path} utilizando Baud Rate de ${SERIAL_BAUD_RATE}`);
    });

    // Processa os dados recebidos do Arduino
    arduino.pipe(new serialport.ReadlineParser({ delimiter: '\r\n' })).on('data', async (data) => {

        const valores = data.split(';');
        const lm35Temperatura = parseFloat(valores[0]);
        const chave = parseInt(valores[1]);

        let v = [
            
            `INSERT INTO DadosAbertura (idDadoAbertura, Aberturas, fksensorbloqueio, fkporta, fkrefrigerador, fkestabelecimento, fkCliente) VALUES (${idmetrica},${qtd_abertura},${idsensor},${1},${1},${1},${1})`,
            
            `INSERT INTO dadosTemperatura (idDadoTemperatura, Temperatura, fkSensorTemperatura, fkRefrigerador, fkEstabelecimento, fkCliente) VALUES (${idmetrica},${lm35Temperatura},${1},${1},${1},${1})`
            
        ]
        

        


        // Armazena os valores dos sensores nos arrays correspondentes
        valoresLm35Temperatura.push(lm35Temperatura);
        valoresChave.push(chave);

        // Insere os dados no banco de dados (se habilitado)
        // await poolBancoDados.execute(
        // )

        console.log('Temperatura interna do refrigerador:', lm35Temperatura)
        console.log(' ')
        console.log(' ')

        //LÓGICA QUE FAZ A SOMA DA ABERTURA DAS PORTAS
        if (chave == 1 && controle){
        
            //SE A CHAVE É 1 E A VARIAVEL DE CONTROLE É TRUE, EU ABRI A PORTA E VOU SOMAR NA QTD_ABERTURA
            qtd_abertura += chave;

            //EU DEFINO A VARIAVEL DE CONTROLE COMO FALSE ATE EU FECHAR A PORTA
            controle = false;
        } 
        //SE A CHAVE É 0, A PORTA ESTA FECHADA E EU POSSO INSERIR DE NOVO, LOGO A VARIAVEL DE CONTROLE VIRA TRUE
        if(chave == 0 && !controle) {
            controle = true
        }
        

        if (HABILITAR_OPERACAO_INSERIR == 1) {
           
            for (var i = 0; i < v.length; i++){

                await poolBancoDados.execute(v[i]);
            }
            
            //APOS O MEU INSERT EU AUMENTO O ID DA METRICA EM UM (AQUI É O AUTO_INCREMENT SÓ QUE FEITO NA API)
            idmetrica++

            //RESETO A VARIAVEL QUE EXIBE A QUANTIDADE DE ABERTURAS, AFINAL EU JA INSERI
            qtd_abertura = 0

        
        }
        
    });

  

    // Evento para lidar com erros na comunicação serial
    arduino.on('error', (mensagem) => {
        console.error(`Erro no arduino (Mensagem: ${mensagem}`)
    });
}


// não altere!
// Função para criar e configurar o servidor web
const servidor = (
    valoresLm35Temperatura,
    valoresChave
) => {
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
}

// Função principal assíncrona para iniciar a comunicação serial e o servidor web
(async () => {
    // Arrays para armazenar os valores dos sensores
    const valoresLm35Temperatura = [];
    const valoresChave = [];

    // Inicia a comunicação serial
    await serial(
        valoresLm35Temperatura,
        valoresChave
    );

    // Inicia o servidor web
    servidor(
        valoresLm35Temperatura,
        valoresChave
    );
})();