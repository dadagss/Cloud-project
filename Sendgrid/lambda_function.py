import json
import os
import boto3
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

# É uma boa prática inicializar os clientes fora do handler
# para aproveitar a reutilização de execução do Lambda.
s3_client = boto3.client('s3')
sg_client = SendGridAPIClient(os.environ.get('SENDGRID_API_KEY'))
SOURCE_EMAIL = os.environ.get('SOURCE_EMAIL')

def format_order_details(details):
    """Função auxiliar para formatar os detalhes do pedido de forma legível."""
    if not isinstance(details, list):
        # Se os detalhes não forem uma lista, apenas retorne como string
        return str(details)
    
    formatted_lines = []
    for item in details:
        # Exemplo: assume que cada item é um dicionário com 'produto' e 'preco'
        product_name = item.get('produto', 'N/A')
        product_price = item.get('preco', 0)
        formatted_lines.append(f"- {product_name}: R$ {product_price:.2f}")
    
    return "\n".join(formatted_lines)

def lambda_handler(event, context):
    try:
        # 1. Obter informações do evento S3
        s3_event = event['Records'][0]['s3']
        bucket_name = s3_event['bucket']['name']
        object_key = s3_event['object']['key']

        # 2. Baixar e ler o arquivo do S3
        response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        order_data = response['Body'].read().decode('utf-8')
        order = json.loads(order_data)

        # 3. Extrair dados do pedido de forma segura com .get()
        customer_email = order.get('email')
        order_id = order.get('order_id', 'N/A') # 'N/A' como valor padrão
        order_details = order.get('details', [])

        if not customer_email:
            print("Erro: E-mail do cliente não encontrado no arquivo JSON.")
            return {
                'statusCode': 400, # Bad Request
                'body': json.dumps('E-mail do cliente ausente no pedido.')
            }

        # 4. Criar o conteúdo do e-mail com formatação melhorada
        formatted_details = format_order_details(order_details)
        email_subject = f"Confirmação de Pedido #{order_id}"
        email_body = (
            f"Olá,\n\n"
            f"Seu pedido #{order_id} foi recebido com sucesso!\n\n"
            f"Detalhes do Pedido:\n{formatted_details}\n\n"
            f"Obrigado por comprar conosco!"
        )

        # 5. Configurar e enviar e-mail
        message = Mail(
            from_email=SOURCE_EMAIL,
            to_emails=customer_email,
            subject=email_subject,
            plain_text_content=email_body
        )
        
        response = sg_client.send(message)
        
        print(f"E-mail enviado com sucesso para {customer_email}. Status: {response.status_code}")

        # **RETORNO DE SUCESSO**
        return {
            'statusCode': 200,
            'body': json.dumps('E-mail de confirmação enviado com sucesso!')
        }

    except Exception as e:
        # Captura qualquer erro (falha no S3, JSON inválido, erro do SendGrid, etc.)
        print(f"Ocorreu um erro: {str(e)}")
        
        # **RETORNO DE ERRO**
        return {
            'statusCode': 500,
            'body': json.dumps(f'Erro ao processar o pedido: {str(e)}')
        }