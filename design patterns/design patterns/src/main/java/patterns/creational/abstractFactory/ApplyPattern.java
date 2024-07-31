package patterns.creational.abstractFactory;

import patterns.constant.DevType;
import patterns.creational.abstractFactory.ingredients.factory.FactoryProducer;

public class ApplyPattern {
    public static void main(String[] args) {
        var devFactory = FactoryProducer.getFactory(DevType.BACK_END);
        var developer = devFactory.getDeveloper(DevType.STATIC);
        developer.getLanguage();
    }
}
