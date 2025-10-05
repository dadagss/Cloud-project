import json
import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import boto3

def lambda_handler(event, context):
    # Obter informações do evento S3
    s3_event = event['Records'][0]['s3']
    bucket_name = s3_event['bucket']['name']
    object_key = s3_event['object']['key']
    
    # Criar cliente S3
    s3_client = boto3.client('s3')
    
    # Baixar o arquivo do pedido
    response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
    order_data = response['Body'].read().decode('utf-8')
    
    # Parse do JSON do pedido
    order = json.loads(order_data)
    customer_email = order['email']
    order_id = order['order_id']
    order_details = order['details']
    
    # Criar o conteúdo do e-mail
    email_subject = f"Confirmação de Pedido #{order_id}"
    
    # Usar string multi-linha (com aspas triplas) melhora a legibilidade
    email_body = f"""Olá,

Seu pedido foi recebido com sucesso!

Detalhes do Pedido:
{order_details}

Obrigado por comprar conosco!"""
    
    # Enviar e-mail usando SendGrid
    message = Mail(
        from_email=os.environ['SOURCE_EMAIL'],
        to_emails=customer_email,
        subject=email_subject,
        plain_text_content=email_body
    )
    
    try:
        sg = SendGridAPIClient(os.environ['SENDGRID_API_KEY'])
        response = sg.send(message)
        print(f"SendGrid status code: {response.status_code}")
        
    except Exception as e:
        print(f"Erro ao enviar e-mail: {e}")
        # Em um caso real, você poderia lançar a exceção para o Lambda falhar e tentar novamente
        # raise e 
    
    return {
        'statusCode': 200,
        'body': json.dumps('E-mail de confirmação enviado com sucesso!')
    }